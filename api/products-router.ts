import crypto from "node:crypto";
import { z } from "zod";
import { and, asc, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { mediaAssets, orderItems, products, productVariants } from "@db/schema";
import { AUDIENCES, CATEGORIES, SIZE_TYPES } from "@contracts/constants";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { audit } from "./queries/audit";
import { getDriver } from "./integrations/rbmsoft/syncService";

/**
 * Staff product management (SPEC §4 products.*): barcode-first CRUD, photo
 * binding by (productId, color), publish/unpublish via status. Products with
 * order history are never deleted — archived instead.
 */

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
  return base || "product";
}

async function uniqueSlug(base: string): Promise<string> {
  const db = getDb();
  let candidate = base;
  for (let i = 2; ; i++) {
    const [row] = await db.select({ id: products.id }).from(products).where(eq(products.slug, candidate)).limit(1);
    if (!row) return candidate;
    candidate = `${base}-${i}`;
  }
}

function generatedSku(slug: string, color: string, size: string): string {
  const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 12);
  return `SF-${clean(slug).slice(0, 20)}-${clean(color) || "X"}-${clean(size) || "OS"}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

function generatedBarcode(): string {
  // EAN-13-shaped numeric barcode in the SAFI 200-internal range.
  return `200${crypto.randomInt(0, 1_000_000_000).toString().padStart(9, "0")}${crypto.randomInt(0, 10)}`;
}

const variantInput = z.object({
  color: z.string().trim().min(1).max(48),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  size: z.string().trim().min(1).max(16),
  sizeType: z.enum(SIZE_TYPES),
  barcode: z.string().trim().min(4).max(64).optional(),
  priceOverrideCents: z.number().int().min(0).optional(),
});

const productFields = {
  nameEn: z.string().trim().min(2).max(180),
  nameAr: z.string().trim().max(180).optional(),
  descriptionEn: z.string().trim().max(5000).optional(),
  descriptionAr: z.string().trim().max(5000).optional(),
  audience: z.enum(AUDIENCES),
  category: z.enum(CATEGORIES),
  brand: z.string().trim().max(64).optional(),
  basePriceCents: z.number().int().min(0),
  compareAtPriceCents: z.number().int().min(0).optional(),
  isNew: z.boolean().optional(),
  isTrending: z.boolean().optional(),
  metaTitle: z.string().trim().max(200).optional(),
  metaDescription: z.string().trim().max(300).optional(),
};

export const productsRouter = createRouter({
  list: staffQuery
    .input(
      z.object({
        status: z.enum(["draft", "active", "archived"]).optional(),
        search: z.string().trim().max(120).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(25),
      }),
    )
    .query(async ({ input }) => {
      const db = getDb();
      const where = [];
      if (input.status) where.push(eq(products.status, input.status));
      if (input.search) {
        const q = `%${input.search.replace(/[%_]/g, "")}%`;
        where.push(or(like(products.nameEn, q), like(products.brand, q))!);
      }
      const condition = where.length ? and(...where) : undefined;
      const [rows, [{ n }]] = await Promise.all([
        db.select().from(products).where(condition).orderBy(desc(products.createdAt)).limit(input.pageSize).offset((input.page - 1) * input.pageSize),
        db.select({ n: sql<number>`count(*)` }).from(products).where(condition),
      ]);
      return { items: rows, total: Number(n), page: input.page, pageSize: input.pageSize };
    }),

  detail: staffQuery
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [product] = await db.select().from(products).where(eq(products.id, input.id)).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
      const variants = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, product.id))
        .orderBy(asc(productVariants.color), asc(productVariants.size));
      const media = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.productId, product.id))
        .orderBy(asc(mediaAssets.sortOrder), asc(mediaAssets.id));
      return { product, variants, media };
    }),

  // Barcode-first flow (SPEC §4): scan a barcode → existing variant for
  // quick edit/restock, or a draft template pre-filled from RBMsoft when the
  // POS knows the barcode but the storefront doesn't.
  scanOrCreate: staffQuery
    .input(z.object({ barcode: z.string().trim().min(3).max(64) }))
    .mutation(async ({ input }) => {
      const db = getDb();
      const [row] = await db
        .select({ variant: productVariants, product: products })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(eq(productVariants.barcode, input.barcode))
        .limit(1);
      if (row) return { found: true as const, variant: row.variant, product: row.product };

      // Unknown locally — ask the RBMsoft driver for a prefill template.
      try {
        const items = await getDriver().fetchItems();
        const match = items.find((i) => i.barcode === input.barcode);
        if (match) {
          return {
            found: false as const,
            prefill: {
              barcode: match.barcode,
              nameEn: match.name,
              color: match.color ?? "",
              size: match.size ?? "",
              basePriceCents: match.priceCents,
              rbmsoftItemId: match.itemId,
            },
          };
        }
      } catch {
        // Driver unreachable → blank template; staff fills it in manually.
      }
      return { found: false as const, prefill: { barcode: input.barcode } };
    }),

  create: staffQuery
    .input(z.object({ ...productFields, variants: z.array(variantInput).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { variants: variantInputs, ...fields } = input;
      const slug = await uniqueSlug(slugify(fields.nameEn));
      const [ins] = await db
        .insert(products)
        .values({
          ...fields,
          slug,
          status: "draft",
          isNew: fields.isNew ?? false,
          isTrending: fields.isTrending ?? false,
        })
        .$returningId();
      const productId = ins.id;
      for (const v of variantInputs) {
        await db.insert(productVariants).values({
          productId,
          sku: generatedSku(slug, v.color, v.size),
          barcode: v.barcode ?? generatedBarcode(),
          color: v.color,
          colorHex: v.colorHex ?? null,
          size: v.size,
          sizeType: v.sizeType,
          priceOverrideCents: v.priceOverrideCents ?? null,
        });
      }
      await audit(ctx.user.id, "product.created", "product", productId, { slug, nameEn: fields.nameEn });
      return { success: true as const, id: productId, slug };
    }),

  update: staffQuery
    .input(z.object({ id: z.coerce.number().int().positive(), ...productFields }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const { id, ...fields } = input;
      const [product] = await db.select().from(products).where(eq(products.id, id)).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
      await db
        .update(products)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(products.id, id));
      await audit(ctx.user.id, "product.updated", "product", id, { changed: Object.keys(fields) });
      return { success: true as const };
    }),

  // Variant management: add a variant to an existing product, or toggle one.
  addVariant: staffQuery
    .input(z.object({ productId: z.coerce.number().int().positive(), variant: variantInput }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [product] = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
      if (input.variant.barcode) {
        const [dupe] = await db
          .select({ id: productVariants.id })
          .from(productVariants)
          .where(eq(productVariants.barcode, input.variant.barcode))
          .limit(1);
        if (dupe) throw new TRPCError({ code: "CONFLICT", message: "That barcode is already in use." });
      }
      const [ins] = await db
        .insert(productVariants)
        .values({
          productId: product.id,
          sku: generatedSku(product.slug, input.variant.color, input.variant.size),
          barcode: input.variant.barcode ?? generatedBarcode(),
          color: input.variant.color,
          colorHex: input.variant.colorHex ?? null,
          size: input.variant.size,
          sizeType: input.variant.sizeType,
          priceOverrideCents: input.variant.priceOverrideCents ?? null,
        })
        .$returningId();
      await audit(ctx.user.id, "product.variant_added", "product", product.id, { variantId: ins.id });
      return { success: true as const, id: ins.id };
    }),

  setVariantActive: staffQuery
    .input(z.object({ variantId: z.coerce.number().int().positive(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.update(productVariants).set({ isActive: input.isActive, updatedAt: new Date() }).where(eq(productVariants.id, input.variantId));
      await audit(ctx.user.id, input.isActive ? "product.variant_enabled" : "product.variant_disabled", "product_variant", input.variantId, null);
      return { success: true as const };
    }),

  // Publish / unpublish / archive.
  setStatus: staffQuery
    .input(z.object({ id: z.coerce.number().int().positive(), status: z.enum(["draft", "active", "archived"]) }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [product] = await db.select().from(products).where(eq(products.id, input.id)).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
      await db.update(products).set({ status: input.status, updatedAt: new Date() }).where(eq(products.id, input.id));
      await audit(ctx.user.id, `product.status_${input.status}`, "product", input.id, { from: product.status });
      return { success: true as const };
    }),

  // Never delete products with order history — archive instead (SPEC §4).
  remove: staffQuery
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [product] = await db.select().from(products).where(eq(products.id, input.id)).limit(1);
      if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "Product not found." });
      const variantIds = (
        await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, product.id))
      ).map((v) => v.id);
      if (variantIds.length) {
        const [sold] = await db
          .select({ id: orderItems.id })
          .from(orderItems)
          .where(inArray(orderItems.variantId, variantIds))
          .limit(1);
        if (sold) {
          await db.update(products).set({ status: "archived", updatedAt: new Date() }).where(eq(products.id, product.id));
          await audit(ctx.user.id, "product.archived_not_deleted", "product", product.id, { reason: "order_history" });
          return { success: true as const, archived: true as const };
        }
      }
      await db.delete(products).where(eq(products.id, product.id));
      await audit(ctx.user.id, "product.deleted", "product", product.id, { slug: product.slug });
      return { success: true as const, archived: false as const };
    }),

  // Photo binding = (productId, color). Assign in one shot; sortOrder
  // follows the array order (first image = cover).
  bindPhotos: staffQuery
    .input(
      z.object({
        productId: z.coerce.number().int().positive(),
        color: z.string().trim().min(1).max(48),
        assetIds: z.array(z.coerce.number().int().positive()).min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      for (const [i, assetId] of input.assetIds.entries()) {
        await db
          .update(mediaAssets)
          .set({ productId: input.productId, color: input.color, sortOrder: i })
          .where(eq(mediaAssets.id, assetId));
      }
      await audit(ctx.user.id, "product.photos_bound", "product", input.productId, { color: input.color, assetIds: input.assetIds });
      return { success: true as const };
    }),

  reorderPhotos: staffQuery
    .input(
      z.object({
        productId: z.coerce.number().int().positive(),
        color: z.string().trim().min(1).max(48),
        assetIds: z.array(z.coerce.number().int().positive()).min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      for (const [i, assetId] of input.assetIds.entries()) {
        await db
          .update(mediaAssets)
          .set({ sortOrder: i })
          .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.productId, input.productId), eq(mediaAssets.color, input.color)));
      }
      await audit(ctx.user.id, "product.photos_reordered", "product", input.productId, { color: input.color });
      return { success: true as const };
    }),

  unbindPhoto: staffQuery
    .input(z.object({ assetId: z.coerce.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db.update(mediaAssets).set({ productId: null, color: null, sortOrder: 0 }).where(eq(mediaAssets.id, input.assetId));
      await audit(ctx.user.id, "product.photo_unbound", "media_asset", input.assetId, null);
      return { success: true as const };
    }),
});
