// One-time migration: convert existing R2 product images to WebP.
//
// - Reads every image URL referenced by `products.images` and
//   `product_color_images.images` in production MySQL.
// - For each unique URL that points at the R2 public bucket and isn't
//   already .webp, downloads the object, converts it to WebP (quality 82,
//   matching the live upload pipeline in api/lib/r2.ts), and uploads it as
//   a new content-addressed object. Animated GIFs are skipped (left as-is)
//   to avoid collapsing them to a single frame.
// - Originals are NOT deleted from R2 — this migration only adds new
//   objects and repoints the database, so it's safe to re-run and easy to
//   roll back (the mapping file below has the old URLs).
// - Updates the two tables to point at the new WebP URLs.
// - Writes a JSON mapping of old->new URLs to scripts/.migration-output/
//   for auditing / rollback.
//
// Usage: node scripts/migrate-r2-webp.mjs
// Requires DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
// R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL in the process
// environment (not committed anywhere).

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";
import sharp from "sharp";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

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

function keyFromUrl(url) {
  if (!url.startsWith(publicBase + "/")) return null;
  return url.slice(publicBase.length + 1);
}

function extensionForMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

function mimeFromKey(key) {
  const ext = key.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function convertKeyToWebp(key) {
  const mime = mimeFromKey(key);
  if (mime === "image/webp") {
    return { skipped: true, reason: "already-webp" };
  }

  const getResp = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  const buffer = await streamToBuffer(getResp.Body);

  const image = sharp(buffer, { animated: mime === "image/gif" });
  const metadata = await image.metadata();
  if (mime === "image/gif" && (metadata.pages ?? 1) > 1) {
    return { skipped: true, reason: "animated-gif" };
  }

  const webpBuffer = await image.webp({ quality: 82, effort: 4 }).toBuffer();

  const prefix = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : "products";
  const hash = createHash("sha256").update(webpBuffer).digest("hex").slice(0, 32);
  const newKey = `${prefix}/${hash}.webp`;

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: newKey,
      Body: webpBuffer,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return {
    skipped: false,
    originalBytes: buffer.length,
    newBytes: webpBuffer.length,
    newUrl: `${publicBase}/${newKey}`,
  };
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);

  const [productRows] = await conn.query("SELECT id, images FROM products");
  const [colorRows] = await conn.query("SELECT id, images FROM product_color_images");

  console.log(`Loaded ${productRows.length} products, ${colorRows.length} product_color_images rows.`);

  // Collect every unique R2 URL referenced anywhere.
  const allUrls = new Set();
  for (const row of [...productRows, ...colorRows]) {
    const images = typeof row.images === "string" ? JSON.parse(row.images) : row.images;
    for (const url of images ?? []) {
      if (typeof url === "string" && keyFromUrl(url)) allUrls.add(url);
    }
  }

  console.log(`Found ${allUrls.size} unique R2 image URLs referenced in the database.`);

  const urlMap = new Map(); // old URL -> new URL (only for converted ones)
  let converted = 0;
  let skippedAlreadyWebp = 0;
  let skippedAnimated = 0;
  let failed = 0;
  let totalOriginalBytes = 0;
  let totalNewBytes = 0;

  for (const url of allUrls) {
    const key = keyFromUrl(url);
    try {
      const result = await convertKeyToWebp(key);
      if (result.skipped) {
        if (result.reason === "already-webp") skippedAlreadyWebp++;
        else skippedAnimated++;
        continue;
      }
      urlMap.set(url, result.newUrl);
      converted++;
      totalOriginalBytes += result.originalBytes;
      totalNewBytes += result.newBytes;
      console.log(
        `[${converted}] ${key} -> ${result.newUrl.split("/").pop()} (${result.originalBytes} -> ${result.newBytes} bytes)`,
      );
    } catch (err) {
      failed++;
      console.error(`FAILED to convert ${key}:`, err.message);
    }
  }

  console.log("\n--- Conversion summary ---");
  console.log(`Converted: ${converted}`);
  console.log(`Skipped (already WebP): ${skippedAlreadyWebp}`);
  console.log(`Skipped (animated GIF): ${skippedAnimated}`);
  console.log(`Failed: ${failed}`);
  if (converted > 0) {
    console.log(
      `Bytes: ${totalOriginalBytes} -> ${totalNewBytes} (${Math.round((1 - totalNewBytes / totalOriginalBytes) * 100)}% smaller)`,
    );
  }

  // Persist a rollback/audit mapping before touching the DB.
  const outDir = path.resolve(process.cwd(), "scripts/.migration-output");
  fs.mkdirSync(outDir, { recursive: true });
  const mappingPath = path.join(outDir, `webp-migration-${Date.now()}.json`);
  fs.writeFileSync(mappingPath, JSON.stringify(Object.fromEntries(urlMap), null, 2));
  console.log(`\nWrote URL mapping (for rollback/audit) to ${mappingPath}`);

  if (urlMap.size === 0) {
    console.log("Nothing to update in the database.");
    await conn.end();
    return;
  }

  // Update DB rows whose images array references any converted URL.
  let productsUpdated = 0;
  for (const row of productRows) {
    const images = typeof row.images === "string" ? JSON.parse(row.images) : row.images;
    let changed = false;
    const newImages = (images ?? []).map((u) => {
      if (typeof u === "string" && urlMap.has(u)) {
        changed = true;
        return urlMap.get(u);
      }
      return u;
    });
    if (changed) {
      await conn.query("UPDATE products SET images = ? WHERE id = ?", [
        JSON.stringify(newImages),
        row.id,
      ]);
      productsUpdated++;
    }
  }

  let colorRowsUpdated = 0;
  for (const row of colorRows) {
    const images = typeof row.images === "string" ? JSON.parse(row.images) : row.images;
    let changed = false;
    const newImages = (images ?? []).map((u) => {
      if (typeof u === "string" && urlMap.has(u)) {
        changed = true;
        return urlMap.get(u);
      }
      return u;
    });
    if (changed) {
      await conn.query("UPDATE product_color_images SET images = ? WHERE id = ?", [
        JSON.stringify(newImages),
        row.id,
      ]);
      colorRowsUpdated++;
    }
  }

  console.log(`\nUpdated ${productsUpdated} products rows, ${colorRowsUpdated} product_color_images rows.`);
  console.log("Original R2 objects were left in place (not deleted).");

  await conn.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
