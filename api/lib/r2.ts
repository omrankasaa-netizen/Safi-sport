import { createHash } from "node:crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { env } from "./env";

/**
 * Cloudflare R2 object storage (S3-compatible). Product photos are uploaded
 * here so the database only ever stores a short public URL instead of a
 * multi-hundred-KB base64 blob — smaller rows, and images are served from
 * Cloudflare's edge cache instead of round-tripping through the app server.
 *
 * If R2 isn't configured (e.g. local dev without the env vars set), every
 * export here degrades to "not configured" so callers can fall back to the
 * original data-URL behavior with zero regression.
 */

const r2Configured =
  !!env.r2AccountId &&
  !!env.r2AccessKeyId &&
  !!env.r2SecretAccessKey &&
  !!env.r2BucketName;

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.r2AccessKeyId,
        secretAccessKey: env.r2SecretAccessKey,
      },
    });
  }
  return client;
}

const DATA_URL_RE = /^data:([\w./+-]+);base64,(.+)$/s;

function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

/**
 * Re-encodes a raster image buffer as WebP for a smaller payload over the
 * wire (typically 25-35% smaller than an equivalent JPEG/PNG at the same
 * visual quality) — this is the format actually served to shoppers, which
 * matters most on slow mobile connections. Animated GIFs are left untouched
 * so we never risk flattening an animation to a single frame; everything
 * else (JPEG, PNG, single-frame GIF, already-WebP re-saves) is converted.
 * Alpha transparency is preserved automatically by sharp's WebP encoder.
 * Fails soft: on any error, returns the original buffer/mime so the upload
 * still succeeds with the source format instead of failing outright.
 */
async function toWebpIfPossible(
  buffer: Buffer,
  mime: string,
): Promise<{ buffer: Buffer; mime: string }> {
  try {
    const image = sharp(buffer, { animated: mime === "image/gif" });
    const metadata = await image.metadata();
    if (mime === "image/gif" && (metadata.pages ?? 1) > 1) {
      // Animated GIF — converting would collapse it to a still frame.
      return { buffer, mime };
    }
    const webpBuffer = await image
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    return { buffer: webpBuffer, mime: "image/webp" };
  } catch (err) {
    console.error("[r2] WebP conversion failed, uploading original", err);
    return { buffer, mime };
  }
}

export function isR2Configured(): boolean {
  return r2Configured;
}

/**
 * Uploads a base64 data URL to R2 and returns its public CDN URL, or `null`
 * if R2 isn't configured, the input isn't a data URL, or the upload fails
 * for any reason — always fail soft so the caller can keep the data URL.
 */
export async function uploadDataUrlToR2(
  dataUrl: string,
  keyPrefix = "products",
): Promise<string | null> {
  if (!r2Configured) return null;

  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) return null;

  const [, sourceMime, base64] = match;
  let sourceBuffer: Buffer;
  try {
    sourceBuffer = Buffer.from(base64, "base64");
  } catch {
    return null;
  }

  const { buffer, mime } = await toWebpIfPossible(sourceBuffer, sourceMime);

  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 32);
  const key = `${keyPrefix}/${hash}.${extensionForMime(mime)}`;

  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: env.r2BucketName,
        Key: key,
        Body: buffer,
        ContentType: mime,
        // Content-addressed key — safe to cache forever at the edge.
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  } catch (err) {
    console.error("[r2] Upload failed", err);
    return null;
  }

  const base = env.r2PublicBaseUrl.replace(/\/+$/, "");
  return `${base}/${key}`;
}

/**
 * Uploads an already-encoded image buffer (e.g. a sharp WebP resize) to R2
 * and returns its public CDN URL, or `null` when R2 isn't configured or the
 * upload fails — callers fall back to local /uploads.
 */
export async function uploadBufferToR2(
  buffer: Buffer,
  mime: string,
  keyPrefix = "products",
): Promise<string | null> {
  if (!r2Configured) return null;
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 32);
  const key = `${keyPrefix}/${hash}.${extensionForMime(mime)}`;
  try {
    await getClient().send(
      new PutObjectCommand({
        Bucket: env.r2BucketName,
        Key: key,
        Body: buffer,
        ContentType: mime,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  } catch (err) {
    console.error("[r2] Upload failed", err);
    return null;
  }
  const base = env.r2PublicBaseUrl.replace(/\/+$/, "");
  return `${base}/${key}`;
}
