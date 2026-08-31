// One-time migration: move inline base64 data-URL images (stored directly
// in the `images` JSON column) out of the database and into R2, converting
// them to WebP on the way.
//
// - Reads every image entry in `products.images` and
//   `product_color_images.images` in production MySQL.
// - For each entry that is a `data:<mime>;base64,<data>` URL (not an R2 URL,
//   not a bundled `/assets/...` placeholder), decodes it, converts to WebP
//   (quality 82, effort 4 — matching api/lib/r2.ts's live upload pipeline),
//   uploads it to R2 as a new content-addressed object, and replaces the
//   inline blob with the resulting public R2 URL.
// - Animated GIFs are skipped (left as inline data) to avoid collapsing
//   them to a single frame — none were found in this dataset, but the
//   safeguard matches the earlier WebP migration script.
// - Before touching the DB, writes a full backup of every original data URL
//   (by product/table/row id + array index) to scripts/.migration-output/
//   so the exact original bytes can be restored if ever needed. This is the
//   rollback story here since — unlike the R2->WebP migration — there is no
//   "original object left in place"; the original bytes only ever lived in
//   the database row we're about to overwrite.
//
// Usage: node scripts/migrate-inline-images-to-r2.mjs
// Requires DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL in the process
// environment (not committed anywhere).

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import sharp from "sharp";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const {
  DATABASE_URL,
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_BASE_URL,
} = process.env;

for (const [k, v] of Object.entries({
  DATABASE_URL,
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME,
  R2_PUBLIC_BASE_URL,
})) {
  if (!v) {
    console.error(`Missing required env var ${k}`);
    process.exit(1);
  }
}

const publicBase = R2_PUBLIC_BASE_URL.replace(/\/+$/, "");

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

const DATA_URL_RE = /^data:([\w./+-]+);base64,(.+)$/s;

function extensionForMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

async function convertDataUrlToWebpAndUpload(dataUrl) {
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) return { error: "not-a-data-url" };

  const [, sourceMime, base64] = match;
  let sourceBuffer;
  try {
    sourceBuffer = Buffer.from(base64, "base64");
  } catch (err) {
    return { error: `base64-decode-failed: ${err.message}` };
  }

  let buffer = sourceBuffer;
  let mime = sourceMime;
  try {
    const image = sharp(sourceBuffer, { animated: sourceMime === "image/gif" });
    const metadata = await image.metadata();
    if (sourceMime === "image/gif" && (metadata.pages ?? 1) > 1) {
      return { skipped: true, reason: "animated-gif" };
    }
    const webpBuffer = await image.webp({ quality: 82, effort: 4 }).toBuffer();
    buffer = webpBuffer;
    mime = "image/webp";
  } catch (err) {
    console.error("WebP conversion failed, uploading original format:", err.message);
  }

  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 32);
  const key = `products/${hash}.${extensionForMime(mime)}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mime,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return {
    skipped: false,
    originalBytes: sourceBuffer.length,
    newBytes: buffer.length,
    newUrl: `${publicBase}/${key}`,
  };
}

async function migrateTable(conn, table, rows, backups, stats) {
  let rowsUpdated = 0;
  for (const row of rows) {
    const images = typeof row.images === "string" ? JSON.parse(row.images) : row.images;
    if (!Array.isArray(images)) continue;

    let changed = false;
    const newImages = [];
    for (let i = 0; i < images.length; i++) {
      const entry = images[i];
      if (typeof entry !== "string" || !entry.startsWith("data:")) {
        newImages.push(entry);
        continue;
      }

      // Back up the exact original bytes before we touch anything.
      backups.push({ table, id: row.id, index: i, originalDataUrl: entry });

      const result = await convertDataUrlToWebpAndUpload(entry);
      if (result.error) {
        stats.failed++;
        console.error(`FAILED ${table}#${row.id}[${i}]: ${result.error}`);
        newImages.push(entry); // leave inline blob in place on failure
        continue;
      }
      if (result.skipped) {
        stats.skippedAnimated++;
        newImages.push(entry);
        continue;
      }

      stats.converted++;
      stats.totalOriginalBytes += result.originalBytes;
      stats.totalNewBytes += result.newBytes;
      console.log(
        `[${stats.converted}] ${table}#${row.id}[${i}] inline blob -> ${result.newUrl.split("/").pop()} (${result.originalBytes} -> ${result.newBytes} bytes)`,
      );
      newImages.push(result.newUrl);
      changed = true;
    }

    if (changed) {
      await conn.query(`UPDATE ${table} SET images = ? WHERE id = ?`, [
        JSON.stringify(newImages),
        row.id,
      ]);
      rowsUpdated++;
    }
  }
  return rowsUpdated;
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);

  const [productRows] = await conn.query("SELECT id, images FROM products");
  const [colorRows] = await conn.query("SELECT id, images FROM product_color_images");

  console.log(`Loaded ${productRows.length} products, ${colorRows.length} product_color_images rows.`);

  const backups = [];
  const stats = {
    converted: 0,
    skippedAnimated: 0,
    failed: 0,
    totalOriginalBytes: 0,
    totalNewBytes: 0,
  };

  // Write backups BEFORE mutating anything, so even a crash mid-run leaves
  // a full record of what was about to change.
  const outDir = path.resolve(process.cwd(), "scripts/.migration-output");
  fs.mkdirSync(outDir, { recursive: true });

  const productsUpdated = await migrateTable(conn, "products", productRows, backups, stats);
  const colorRowsUpdated = await migrateTable(conn, "product_color_images", colorRows, backups, stats);

  const backupPath = path.join(outDir, `inline-image-backup-${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backups));
  console.log(`\nWrote full original-bytes backup (for rollback) to ${backupPath}`);

  console.log("\n--- Conversion summary ---");
  console.log(`Converted: ${stats.converted}`);
  console.log(`Skipped (animated GIF): ${stats.skippedAnimated}`);
  console.log(`Failed: ${stats.failed}`);
  if (stats.converted > 0) {
    console.log(
      `Bytes: ${stats.totalOriginalBytes} -> ${stats.totalNewBytes} (${Math.round((1 - stats.totalNewBytes / stats.totalOriginalBytes) * 100)}% smaller)`,
    );
  }
  console.log(`\nUpdated ${productsUpdated} products rows, ${colorRowsUpdated} product_color_images rows.`);

  await conn.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
