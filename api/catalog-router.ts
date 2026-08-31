import { z } from "zod";
import { and, asc, desc, eq, inArray, like, lte, or, sql, type SQL } from "drizzle-orm";
import { branches, branchStock, mediaAssets, products, productVariants } from "@db/schema";
import { AUDIENCES, CATEGORIES, SIZE_TYPES } from "@contracts/constants";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { availableOf } from "./lib/availability";

/**
 * Public storefront catalog (SPEC §4 catalog.*). Only status='active'
 * products with at least one active variant are exposed. Availability is
 * qtyOnHand − reservedOnline, floored at 0.
 */

const listInput = z.object({
  audience: z.enum(AUDIENCES).optional(),
  category: z.enum(CATEGORIES).optional(),
  size: z.string().trim().max(16).optional(),
  sizeType: z.enum(SIZE_TYPES).optional(),
  color: z.string().trim().max(48).optional(),
  maxPriceCents: z.number().int().min(0).optional(),
  /** Restrict availability math to one branch (storefront branch filter). */
  branchId: z.coerce.number().int().positive().optional(),
  inStock: z.boolean().optional(),
  search: z.string().trim().max(120).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "trending"]).default("newest"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(60).default(24),
});

type VariantRow = typeof productVariants.$inferSelect;

/** Fetch stock rows for variants and compute per-branch availability. */
async function availabilityByVariant(variantIds: number[]) {
  if (!variantIds.length) return new Map<number, Array<{
    branchId: number;
    branchCode: string;
    qtyOnHand: number;
    reservedOnline: number;
    available: number;
    syncSource: string;
    lastSyncedAt: Date | null;
  }>>();
  const db = getDb();
  const rows = await db
    .select({ stock: branchStock, branch: branches })
    .from(branchStock)
    .innerJoin(branches, eq(branches.id, branchStock.branchId))
    .where(inArray(branchStock.variantId, variantIds));
  const map = new Map<number, Array<{
    branchId: number;
    branchCode: string;
    qtyOnHand: number;
    reservedOnline: number;
    available: number;
    syncSource: string;
    lastSyncedAt: Date | null;
  }>>();
  for (const { stock, branch } of rows) {
    const list = map.get(stock.variantId) ?? [];
    list.push({
      branchId: branch.id,
      branchCode: branch.code,
      qtyOnHand: stock.qtyOnHand,
      reservedOnline: stock.reservedOnline,
      available: availableOf(stock),
      syncSource: stock.syncSource,
      lastSyncedAt: stock.lastSyncedAt,
    });
    map.set(stock.variantId, list);
  }
  return map;
}

/** Media rows grouped by color for a set of products (lowest sortOrder first). */
async function mediaByProduct(productIds: number[]) {
  if (!productIds.length) return new Map<number, Map<string, typeof mediaAssets.$inferSelect[]>>();
  const rows = await getDb()
    .select()
    .from(mediaAssets)
    .where(inArray(mediaAssets.productId, productIds))
    .orderBy(asc(mediaAssets.sortOrder), asc(mediaAssets.id));
  const byProduct = new Map<number, Map<string, typeof mediaAssets.$inferSelect[]>>();
  for (const row of rows) {
    if (row.productId == null) continue;
    const byColor = byProduct.get(row.productId) ?? new Map<string, typeof mediaAssets.$inferSelect[]>();
    const key = row.color ?? "";
    byColor.set(key, [...(byColor.get(key) ?? []), row]);
    byProduct.set(row.productId, byColor);
  }
  return byProduct;
}

/** Card shape shared by list/newArrivals/trending/related. */
async function toCards(productRows: (typeof products.$inferSelect)[], opts: { branchId?: number; inStock?: boolean }) {
  const db = getDb();
  const productIds = productRows.map((p) => p.id);
  if (!productIds.length) return [];
  const variantRows = await db
    .select()
    .from(productVariants)
    .where(and(inArray(productVariants.productId, productIds), eq(productVariants.isActive, true)));
  const avail = await availabilityByVariant(variantRows.map((v) => v.id));
  const media = await mediaByProduct(productIds);

  const cards = [];
  for (const product of productRows) {
    const variants = variantRows.filter((v) => v.productId === product.id);
    if (!variants.length) continue;
    let totalAvailable = 0;
    for (const v of variants) {
      for (const a of avail.get(v.id) ?? []) {
        if (opts.branchId && a.branchId !== opts.branchId) continue;
        totalAvailable += a.available;
      }
    }
    if (opts.inStock && totalAvailable <= 0) continue;
    const colors = [...new Set(variants.map((v) => v.color))];
    const sizes = [...new Set(variants.map((v) => v.size))];
    const coverByColor = media.get(product.id);
    const cover =
      (coverByColor ? [...coverByColor.values()].flat()[0] : undefined) ?? undefined;
    cards.push({
      ...product,
      colors,
      sizes,
      totalAvailable,
      coverImage: cover ? { url: cover.url, webpUrl: cover.webpUrl, width: cover.width, height: cover.height } : null,
    });
  }
  return cards;
}

export const catalogRouter = createRouter({
  list: publicQuery.input(listInput).query(async ({ input }) => {
    const db = getDb();
    const where: SQL[] = [eq(products.status, "active")];
    if (input.audience) where.push(eq(products.audience, input.audience));
    if (input.category) where.push(eq(products.category, input.category));
    if (input.maxPriceCents != null) where.push(lte(products.basePriceCents, input.maxPriceCents));
    if (input.search) {
      const q = `%${input.search.replace(/[%_]/g, "")}%`;
      where.push(or(like(products.nameEn, q), like(products.nameAr, q), like(products.brand, q))!);
    }

    // Variant-level filters (size/color) need a join against variants.
    const needsVariantJoin = !!(input.size || input.sizeType || input.color);
    const variantWhere: SQL[] = [eq(productVariants.isActive, true)];
    if (input.size) variantWhere.push(eq(productVariants.size, input.size));
    if (input.sizeType) variantWhere.push(eq(productVariants.sizeType, input.sizeType));
    if (input.color) variantWhere.push(eq(productVariants.color, input.color));

    let productIds: number[] | null = null;
    if (needsVariantJoin) {
      const rows = await db
        .selectDistinct({ id: products.id })
        .from(products)
        .innerJoin(
          productVariants,
          and(eq(productVariants.productId, products.id), ...variantWhere),
        )
        .where(and(...where));
      productIds = rows.map((r) => r.id);
      if (!productIds.length) return { items: [], total: 0, page: input.page, pageSize: input.pageSize };
      where.push(inArray(products.id, productIds));
    }

    const orderBy =
      input.sort === "price_asc"
        ? [asc(products.basePriceCents)]
        : input.sort === "price_desc"
          ? [desc(products.basePriceCents)]
          : input.sort === "trending"
            ? [desc(products.isTrending), desc(products.createdAt)]
            : [desc(products.createdAt)];

    // inStock / branch availability is computed post-query (it depends on
    // branch_stock), so when those filters are active we over-fetch and
    // paginate the filtered result in memory; catalog size is small.
    const postFiltered = !!(input.inStock || input.branchId);
    const allRows = await db
      .select()
      .from(products)
      .where(and(...where))
      .orderBy(...orderBy)
      .limit(postFiltered ? 500 : input.pageSize)
      .offset(postFiltered ? 0 : (input.page - 1) * input.pageSize);

    if (postFiltered) {
      const cards = await toCards(allRows, { branchId: input.branchId, inStock: input.inStock });
      const start = (input.page - 1) * input.pageSize;
      return { items: cards.slice(start, start + input.pageSize), total: cards.length, page: input.page, pageSize: input.pageSize };
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(and(...where));
    const cards = await toCards(allRows, {});
    return { items: cards, total: Number(count), page: input.page, pageSize: input.pageSize };
  }),

  bySlug: publicQuery
    .input(z.object({ slug: z.string().trim().min(1).max(180) }))
    .query(async ({ input }) => {
      const db = getDb();
      const [product] = await db
        .select()
        .from(products)
        .where(and(eq(products.slug, input.slug), eq(products.status, "active")))
        .limit(1);
      if (!product) return null;

      const variantRows: VariantRow[] = await db
        .select()
        .from(productVariants)
        .where(and(eq(productVariants.productId, product.id), eq(productVariants.isActive, true)));
      const avail = await availabilityByVariant(variantRows.map((v) => v.id));
      const media = await mediaByProduct([product.id]);
      const branchRows = await db.select().from(branches).where(eq(branches.isActive, true));

      // Media grouped by color ("" = unbound/all colors).
      const imagesByColor: Record<string, { id: number; url: string; webpUrl: string | null; width: number | null; height: number | null }[]> = {};
      for (const [color, assets] of media.get(product.id) ?? new Map<string, (typeof mediaAssets.$inferSelect)[]>()) {
        imagesByColor[color] = assets.map((a) => ({ id: a.id, url: a.url, webpUrl: a.webpUrl, width: a.width, height: a.height }));
      }

      return {
        ...product,
        imagesByColor,
        branches: branchRows,
        variants: variantRows.map((v) => ({
          ...v,
          priceCents: v.priceOverrideCents ?? product.basePriceCents,
          availability: (avail.get(v.id) ?? []).map((a) => ({
            branchId: a.branchId,
            branchCode: a.branchCode,
            available: a.available,
          })),
        })),
      };
    }),

  newArrivals: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(24).default(8) }).optional())
    .query(async ({ input }) => {
      const rows = await getDb()
        .select()
        .from(products)
        .where(and(eq(products.status, "active"), eq(products.isNew, true)))
        .orderBy(desc(products.createdAt))
        .limit(input?.limit ?? 8);
      return toCards(rows, {});
    }),

  trending: publicQuery
    .input(z.object({ limit: z.number().int().min(1).max(24).default(8) }).optional())
    .query(async ({ input }) => {
      const rows = await getDb()
        .select()
        .from(products)
        .where(and(eq(products.status, "active"), eq(products.isTrending, true)))
        .orderBy(desc(products.createdAt))
        .limit(input?.limit ?? 8);
      return toCards(rows, {});
    }),

  related: publicQuery
    .input(z.object({ slug: z.string().trim().min(1).max(180), limit: z.number().int().min(1).max(12).default(4) }))
    .query(async ({ input }) => {
      const db = getDb();
      const [product] = await db.select().from(products).where(eq(products.slug, input.slug)).limit(1);
      if (!product) return [];
      const rows = await db
        .select()
        .from(products)
        .where(and(eq(products.status, "active"), eq(products.category, product.category), sql`${products.id} != ${product.id}`))
        .orderBy(desc(products.isTrending), desc(products.createdAt))
        .limit(input.limit);
      return toCards(rows, {});
    }),
});
