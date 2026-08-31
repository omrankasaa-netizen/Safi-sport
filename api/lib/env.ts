import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export const env = {
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  // Email of the store owner — seeded into staff_roles with role "owner".
  ownerEmail: (process.env.SAFI_OWNER_EMAIL ?? "").trim().toLowerCase(),
  // Comma-separated staff emails allowed to sign in to the admin panel via
  // Google. Matching is case-insensitive.
  adminAllowedEmails: (process.env.SAFI_ADMIN_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  // Cloudflare R2 (S3-compatible object storage) for product photos. All
  // optional — when unset, image uploads fall back to local /uploads.
  r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  r2BucketName: process.env.R2_BUCKET_NAME ?? "",
  r2PublicBaseUrl: process.env.R2_PUBLIC_BASE_URL ?? "",
  // Transactional email (Resend). Optional — when unset, email sends are
  // skipped (logged, not thrown) so local dev keeps working without a key.
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "SAFI SPORT <hello@safisport.com>",
  // Staff inbox that gets a copy of every new order.
  adminNotificationEmail: process.env.SAFI_ADMIN_NOTIFICATION_EMAIL ?? "",
  // Meta Conversions API. All optional — when the token is unset every CAPI
  // send silently no-ops so the site runs with zero Meta config.
  metaPixelId: process.env.SAFI_META_PIXEL_ID ?? "",
  metaCapiAccessToken: process.env.SAFI_META_CAPI_ACCESS_TOKEN ?? "",
  metaTestEventCode: process.env.SAFI_META_TEST_EVENT_CODE ?? "",
  // RBMsoft inventory integration. Driver defaults to "mock" so the whole
  // system runs end-to-end without the real RBMsoft API.
  rbmsoftDriver: (process.env.SAFI_RBMSOFT_DRIVER ?? "mock").trim().toLowerCase(),
  rbmsoftBaseUrl: process.env.SAFI_RBMSOFT_BASE_URL ?? "",
  rbmsoftApiKey: process.env.SAFI_RBMSOFT_API_KEY ?? "",
  rbmsoftItemsPath: process.env.SAFI_RBMSOFT_ITEMS_PATH ?? "/items",
  rbmsoftStockPath: process.env.SAFI_RBMSOFT_STOCK_PATH ?? "/stock",
  rbmsoftSalePath: process.env.SAFI_RBMSOFT_SALE_PATH ?? "/sales",
  rbmsoftWebhookSecret: process.env.SAFI_RBMSOFT_WEBHOOK_SECRET ?? "",
  // Delta sync every 5 min + nightly full sync + reservation janitor,
  // started in boot.ts only when this is "true".
  syncEnabled: (process.env.SAFI_SYNC_ENABLED ?? "false").trim().toLowerCase() === "true",
  // Commerce defaults.
  deliveryFeeCents: parseInt(process.env.SAFI_DELIVERY_FEE_CENTS ?? "300000", 10) || 300000,
  currency: process.env.SAFI_CURRENCY ?? "USD",
};
