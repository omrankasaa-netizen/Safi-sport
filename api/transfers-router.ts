import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLogs, branchStock, branchTransfers, orderItems, orders, products, productVariants } from "@db/schema";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { audit } from "./queries/audit";

/**
 * Branch transfers (SPEC §4 transfers.*): move stock between El Mina and
 * Dam w Farez, usually to fulfil an order flagged needsTransfer.
 */
export const transfersRouter = createRouter({
  list: staffQuery
    .input(z.object({ status: z.enum(["requested", "in_transit", "received", "cancelled"]).optional() }))
    .query(async ({ input }) => {
      const db = getDb();
      const rows = await db
        .select({ transfer: branchTransfers, variant: productVariants, product: products })
        .from(branchTransfers)
        .innerJoin(productVariants, eq(productVariants.id, branchTransfers.variantId))
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(input.status ? eq(branchTransfers.status, input.status) : undefined)
        .orderBy(desc(branchTransfers.createdAt))
        .limit(200);
      return rows.map(({ transfer, variant, product }) => ({
        ...transfer,
        variant: { id: variant.id, sku: variant.sku, barcode: variant.barcode, color: variant.color, size: variant.size },
        product: { id: product.id, nameEn: product.nameEn },
      }));
    }),

  // Auto-prefill helper for an order flagged needsTransfer: its items
  // sourced away from the pickup branch become suggested transfer lines.
  suggestionsForOrder: staffQuery
    .input(z.object({ orderId: z.coerce.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
      if (!order) throw new TRPCError({ code: "NOT_FOUND", message: "Order not found." });
      if (!order.needsTransfer || !order.pickupBranchId) return { order, suggestions: [] };
      const items = await db
        .select()
        .from(orderItems)
        .where(and(eq(orderItems.orderId, order.id), sql`${orderItems.sourceBranchId} != ${order.pickupBranchId}`));
      return {
        order,
        suggestions: items.map((i) => ({
          variantId: i.variantId,
          qty: i.qty,
          fromBranchId: i.sourceBranchId,
          toBranchId: order.pickupBranchId!,
          label: `${i.productName} — ${i.color} / ${i.size} ×${i.qty}`,
        })),
      };
    }),

  create: staffQuery
    .input(
      z.object({
        variantId: z.coerce.number().int().positive(),
        qty: z.number().int().min(1).max(999),
        fromBranchId: z.coerce.number().int().positive(),
        toBranchId: z.coerce.number().int().positive(),
        orderId: z.coerce.number().int().positive().optional(),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.fromBranchId === input.toBranchId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "From and to branches must differ." });
      }
      const db = getDb();
      const [variant] = await db.select().from(productVariants).where(eq(productVariants.id, input.variantId)).limit(1);
      if (!variant) throw new TRPCError({ code: "NOT_FOUND", message: "Variant not found." });
      const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(branchTransfers);
      const transferNumber = `TR-${String(Number(n) + 1).padStart(4, "0")}`;
      const [ins] = await db
        .insert(branchTransfers)
        .values({
          transferNumber,
          variantId: input.variantId,
          qty: input.qty,
          fromBranchId: input.fromBranchId,
          toBranchId: input.toBranchId,
          orderId: input.orderId ?? null,
          note: input.note ?? null,
        })
        .$returningId();
      await audit(ctx.user.id, "transfer.created", "branch_transfer", transferNumber, input);
      return { success: true as const, id: ins.id, transferNumber };
    }),

  markInTransit: staffQuery
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [t] = await db.select().from(branchTransfers).where(eq(branchTransfers.id, input.id)).limit(1);
      if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Transfer not found." });
      if (t.status !== "requested") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `A "${t.status}" transfer can't be sent.` });
      }
      await db.update(branchTransfers).set({ status: "in_transit" }).where(eq(branchTransfers.id, t.id));
      await audit(ctx.user.id, "transfer.in_transit", "branch_transfer", t.transferNumber, null);
      return { success: true as const };
    }),

  // Received: move the qty in local branch_stock (from-branch down,
  // to-branch up) inside one transaction, and audit.
  markReceived: staffQuery
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.transaction(async (tx) => {
        const [t] = await tx.select().from(branchTransfers).where(eq(branchTransfers.id, input.id)).for("update").limit(1);
        if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Transfer not found." });
        if (t.status !== "requested" && t.status !== "in_transit") {
          throw new TRPCError({ code: "BAD_REQUEST", message: `A "${t.status}" transfer can't be received.` });
        }
        await tx
          .update(branchStock)
          .set({ qtyOnHand: sql`GREATEST(0, ${branchStock.qtyOnHand} - ${t.qty})`, updatedAt: new Date() })
          .where(and(eq(branchStock.variantId, t.variantId), eq(branchStock.branchId, t.fromBranchId)));
        const [dest] = await tx
          .select()
          .from(branchStock)
          .where(and(eq(branchStock.variantId, t.variantId), eq(branchStock.branchId, t.toBranchId)))
          .for("update")
          .limit(1);
        if (dest) {
          await tx
            .update(branchStock)
            .set({ qtyOnHand: sql`${branchStock.qtyOnHand} + ${t.qty}`, updatedAt: new Date() })
            .where(eq(branchStock.id, dest.id));
        } else {
          await tx.insert(branchStock).values({
            variantId: t.variantId,
            branchId: t.toBranchId,
            qtyOnHand: t.qty,
            reservedOnline: 0,
            syncSource: "manual",
          });
        }
        await tx
          .update(branchTransfers)
          .set({ status: "received", receivedAt: new Date() })
          .where(eq(branchTransfers.id, t.id));
        await tx.insert(auditLogs).values({
          actorUserId: ctx.user.id,
          action: "transfer.received",
          entity: "branch_transfer",
          entityId: t.transferNumber,
          detail: { qty: t.qty, fromBranchId: t.fromBranchId, toBranchId: t.toBranchId },
        });
      });
      return { success: true as const };
    }),

  cancel: staffQuery
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [t] = await db.select().from(branchTransfers).where(eq(branchTransfers.id, input.id)).limit(1);
      if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Transfer not found." });
      if (t.status === "received" || t.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `A "${t.status}" transfer can't be cancelled.` });
      }
      await db.update(branchTransfers).set({ status: "cancelled" }).where(eq(branchTransfers.id, t.id));
      await audit(ctx.user.id, "transfer.cancelled", "branch_transfer", t.transferNumber, null);
      return { success: true as const };
    }),
});
