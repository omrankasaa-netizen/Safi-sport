import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { asc, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import sharp, { type Metadata, type Sharp } from "sharp";
import { mediaAssets } from "@db/schema";
import { ROLE_LEVEL, type RoleName } from "@contracts/constants";
import { createRouter, staffQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { audit } from "./queries/audit";
import { uploadBufferToR2 } from "./lib/r2";

/**
 * Media upload (SPEC §4 media.*): staff posts an array of base64 data URLs
 * (≤8MB each). Every image is mime-sniffed and re-encoded via sharp (EXIF
 * stripped), resized to 400/1200px WebP q82, stored in R2 with a local
 * /uploads fail-soft, and deduped by sha256.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const WIDTHS = [400, 1200] as const;
const DATA_URL_RE = /^data:([\w./+-]+);base64,(.+)$/s;
const UPLOADS_DIR = path.resolve(process.cwd(), "public", "uploads");

async function saveLocal(buffer: Buffer, key: string): Promise<string> {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, key), buffer);
  return `/uploads/${key}`;
}

async function storeBuffer(buffer: Buffer, mime: string, keyPrefix: string): Promise<string> {
  const viaR2 = await uploadBufferToR2(buffer, mime, keyPrefix);
  if (viaR2) return viaR2;
  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 32);
  return saveLocal(buffer, `${keyPrefix}-${hash}.webp`);
}

const uploadInput = z.object({
  files: z.array(z.string().max(MAX_BYTES * 2)).min(1).max(10),
  // Optional immediate binding; usually photos upload unbound and are bound
  // via products.bindPhotos.
  productId: z.coerce.number().int().positive().optional(),
  color: z.string().trim().max(48).optional(),
});

export const mediaRouter = createRouter({
  upload: staffQuery.input(uploadInput).mutation(async ({ ctx, input }) => {
    const db = getDb();
    const created: (typeof mediaAssets.$inferSelect)[] = [];

    for (const dataUrl of input.files) {
      const match = DATA_URL_RE.exec(dataUrl);
      if (!match) throw new TRPCError({ code: "BAD_REQUEST", message: "Images must be data URLs." });
      const buffer = Buffer.from(match[2], "base64");
      if (buffer.byteLength > MAX_BYTES) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Each photo must be 8MB or smaller." });
      }

      // Mime sniff: sharp parses the real bytes, not the declared mime.
      let image: Sharp;
      let meta: Metadata;
      try {
        image = sharp(buffer, { failOn: "error" }).rotate(); // rotate() applies EXIF orientation then drops EXIF
        meta = await image.metadata();
        if (!meta.width || !meta.height || !meta.format) throw new Error("no dimensions");
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That file isn't a valid image." });
      }

      const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
      const [existing] = await db.select().from(mediaAssets).where(eq(mediaAssets.sha256, sha256)).limit(1);
      if (existing) {
        created.push(existing);
        continue;
      }

      // Re-encode: WebP q82 at 1200px (main) and 400px (thumbnail).
      const mainBuf = await image.clone().resize({ width: WIDTHS[1], withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      const thumbBuf = await image.clone().resize({ width: WIDTHS[0], withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      const url = await storeBuffer(thumbBuf, "image/webp", "products-400");
      const webpUrl = await storeBuffer(mainBuf, "image/webp", "products-1200");

      const [ins] = await db
        .insert(mediaAssets)
        .values({
          url,
          webpUrl,
          width: meta.width,
          height: meta.height,
          sha256,
          productId: input.productId ?? null,
          color: input.productId ? input.color ?? null : null,
        })
        .$returningId();
      const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, ins.id)).limit(1);
      created.push(row);
    }

    await audit(ctx.user.id, "media.uploaded", "media_asset", null, { count: created.length });
    return { success: true as const, assets: created };
  }),

  listUnbound: staffQuery.query(async () => {
    return getDb()
      .select()
      .from(mediaAssets)
      .where(isNull(mediaAssets.productId))
      .orderBy(desc(mediaAssets.createdAt))
      .limit(200);
  }),

  listForProduct: staffQuery
    .input(z.object({ productId: z.coerce.number().int().positive() }))
    .query(async ({ input }) => {
      return getDb()
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.productId, input.productId))
        .orderBy(asc(mediaAssets.color), asc(mediaAssets.sortOrder), asc(mediaAssets.id));
    }),

  // Delete: anyone staff+ can delete an UNBOUND asset; deleting a bound one
  // requires manager+ (SPEC §4 media.delete).
  delete: staffQuery
    .input(z.object({ id: z.coerce.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, input.id)).limit(1);
      if (!asset) throw new TRPCError({ code: "NOT_FOUND", message: "Photo not found." });
      const level = ROLE_LEVEL[(ctx.user.role ?? "viewer") as RoleName] ?? 0;
      if (asset.productId != null && level < ROLE_LEVEL.manager) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only a manager can delete a photo that's attached to a product." });
      }
      await db.delete(mediaAssets).where(eq(mediaAssets.id, asset.id));
      await audit(ctx.user.id, "media.deleted", "media_asset", asset.id, { sha256: asset.sha256 });
      return { success: true as const };
    }),
});
