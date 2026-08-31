import { z } from "zod";
import { and, asc, desc, eq, inArray, like, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { branches, branchStock, lowStockAlerts, products, productVariants } from "@db/schema";
import { createRouter, staffQuery, managerQuery, ownerQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { audit } from "./queries/audit";
import { availableOf } from "./lib/availability";

/**
 * Inventory (SPEC §4 inventory.*): the product → variant → branch grid with
 * availability math and sync-source badges. Stock numbers are RBMsoft's;
 * staff view, managers set thresholds, only owners override quantities.
 */
export const inventoryRouter = createRouter({
  // Staff grid: variants × branches with availability + sync badges.
  grid: staffQuery
    .input(
      z.object({
        branchId: z.coerce.number().int().positive().optional(),
        search: z.string().trim().max(120).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = [eq(productVariants.isActive, true)];
      if (input.search) {
        const q = `%${input.search.replace(/[%_]/g, "")}%`;
        where.push(
          or(like(productVariants.sku, q), like(productVariants.barcode, q), like(products.nameEn, q))!,
        );
      }
      const rows = await db
        .select({ variant: productVariants, product: products })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(and(...where))
        .orderBy(asc(products.nameEn), asc(productVariants.color), asc(productVariants.size))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize);

      const variantIds = rows.map((r) => r.variant.id);
      const stockRows = variantIds.length
        ? await db
            .select()
            .from(branchStock)
            .where(
              input.branchId
                ? and(inArray(branchStock.variantId, variantIds), eq(branchStock.branchId, input.branchId))
                : inArray(branchStock.variantId, variantIds),
            )
        : [];
      const branchRows = await db.select().from(branches).where(eq(branches.isActive, true));
      const stockByVariant = new Map<number, typeof stockRows>();
      for (const s of stockRows) {
        stockByVariant.set(s.variantId, [...(stockByVariant.get(s.variantId) ?? []), s]);
      }

      return {
        branches: branchRows,
        items: rows.map(({ variant, product }) => ({
          variant,
          product: { id: product.id, nameEn: product.nameEn, slug: product.slug, category: product.category, status: product.status },
          stock: branchRows.map((branch) => {
            const s = (stockByVariant.get(variant.id) ?? []).find((x) => x.branchId === branch.id);
            return {
              branchId: branch.id,
              branchCode: branch.code,
              qtyOnHand: s?.qtyOnHand ?? 0,
              reservedOnline: s?.reservedOnline ?? 0,
              available: s ? availableOf(s) : 0,
              lowStockThreshold: s?.lowStockThreshold ?? 2,
              syncSource: s?.syncSource ?? "seed",
              lastSyncedAt: s?.lastSyncedAt ?? null,
            };
          }),
        })),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  // Manager: per variant+branch low-stock threshold.
  setThreshold: managerQuery
    .input(
      z.object({
        variantId: z.coerce.number().int().positive(),
        branchId: z.coerce.number().int().positive(),
        threshold: z.number().int().min(0).max(999),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db
        .select()
        .from(branchStock)
        .where(and(eq(branchStock.variantId, input.variantId), eq(branchStock.branchId, input.branchId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "No stock row for that variant and branch." });
      await db
        .update(branchStock)
        .set({ lowStockThreshold: input.threshold, updatedAt: new Date() })
        .where(eq(branchStock.id, row.id));
      await audit(ctx.user.id, "inventory.threshold_set", "branch_stock", row.id, {
        variantId: input.variantId,
        branchId: input.branchId,
        threshold: input.threshold,
      });
      return { success: true as const };
    }),

  // Owner: manual quantity override. Marks syncSource='manual' so the
  // RBMsoft sync will not stomp it (SPEC §4 inventory.overrideQty).
  overrideQty: ownerQuery
    .input(
      z.object({
        variantId: z.coerce.number().int().positive(),
        branchId: z.coerce.number().int().positive(),
        qtyOnHand: z.number().int().min(0).max(100000),
        reason: z.string().trim().max(300).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db
        .select()
        .from(branchStock)
        .where(and(eq(branchStock.variantId, input.variantId), eq(branchStock.branchId, input.branchId)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "No stock row for that variant and branch." });
      await db
        .update(branchStock)
        .set({ qtyOnHand: input.qtyOnHand, syncSource: "manual", updatedAt: new Date() })
        .where(eq(branchStock.id, row.id));
      await audit(ctx.user.id, "inventory.qty_overridden", "branch_stock", row.id, {
        variantId: input.variantId,
        branchId: input.branchId,
        from: row.qtyOnHand,
        to: input.qtyOnHand,
        reason: input.reason ?? null,
      });
      return { success: true as const, available: Math.max(0, input.qtyOnHand - row.reservedOnline) };
    }),

  // Staff: open low-stock alerts with variant/product context.
  lowStock: staffQuery.query(async () => {
    const db = getDb();
    const rows = await db
      .select({ alert: lowStockAlerts, variant: productVariants, product: products })
      .from(lowStockAlerts)
      .innerJoin(productVariants, eq(productVariants.id, lowStockAlerts.variantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(lowStockAlerts.status, "open"))
      .orderBy(desc(lowStockAlerts.createdAt))
      .limit(200);
    return rows.map(({ alert, variant, product }) => ({ alert, variant, product: { id: product.id, nameEn: product.nameEn } }));
  }),

  // Staff: acknowledge (hide) an alert.
  acknowledgeLowStock: staffQuery
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db.select().from(lowStockAlerts).where(eq(lowStockAlerts.id, input.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found." });
      await db.update(lowStockAlerts).set({ status: "acknowledged" }).where(eq(lowStockAlerts.id, row.id));
      await audit(ctx.user.id, "inventory.low_stock_acknowledged", "low_stock_alert", row.id, null);
      return { success: true as const };
    }),
});
