import {
  mysqlTable,
  serial,
  varchar,
  char,
  text,
  int,
  bigint,
  boolean,
  timestamp,
  datetime,
  mysqlEnum,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

// ── Auth & staff ─────────────────────────────────────────────────────────────
// Role hierarchy (lowest → highest): viewer(0) < staff(1) < manager(2) < owner(3).
// - viewer: dashboard read-only (no financials).
// - staff: orders pipeline, products edit, photos, transfers, inventory view.
// - manager: staff + reports + customers + inventory thresholds + promo codes.
// - owner: everything + users/roles + settings + pixel + sync config +
//   financial reports. Bootstrapped from SAFI_OWNER_EMAIL /
//   SAFI_ADMIN_ALLOWED_EMAILS.
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  unionId: varchar("unionId", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 320 }),
  avatar: text("avatar"),
  role: mysqlEnum("role", ["viewer", "staff", "manager", "owner"]).default("viewer").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignInAt: timestamp("lastSignInAt").defaultNow().notNull(),
});

// Email sign-in codes ("OTP"): staff types their email, we mail a 6-digit
// code, they type it back in to sign in. `codeHash` stores a salted hash,
// never the plaintext code. One row per code sent; old rows are left to
// expire (no cleanup job needed at this volume).
export const emailOtps = mysqlTable(
  "email_otps",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    codeHash: varchar("codeHash", { length: 128 }).notNull(),
    attempts: int("attempts").default(0).notNull(),
    consumedAt: timestamp("consumedAt"),
    expiresAt: timestamp("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: index("email_otps_email_idx").on(t.email),
  }),
);

// Staff directory: who can access the admin panel and at what role. Managed
// from the Users & Roles screen (owner only). Rows here are synced into
// `users.role` the next time that email signs in.
export const staffRoles = mysqlTable("staff_roles", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 160 }),
  role: mysqlEnum("role", ["staff", "manager", "owner"]).notNull(),
  addedByUserId: bigint("addedByUserId", { mode: "number", unsigned: true }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ── Branches ─────────────────────────────────────────────────────────────────
export const branches = mysqlTable("branches", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 16 }).notNull().unique(), // 'elmina' | 'dam'
  nameEn: varchar("nameEn", { length: 160 }).notNull(),
  nameAr: varchar("nameAr", { length: 160 }),
  address: varchar("address", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 32 }),
  whatsapp: varchar("whatsapp", { length: 32 }),
  mapsUrl: varchar("mapsUrl", { length: 500 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ── Catalog ──────────────────────────────────────────────────────────────────
export const products = mysqlTable(
  "products",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 180 }).notNull().unique(),
    nameEn: varchar("nameEn", { length: 180 }).notNull(),
    nameAr: varchar("nameAr", { length: 180 }),
    descriptionEn: text("descriptionEn"),
    descriptionAr: text("descriptionAr"),
    audience: mysqlEnum("audience", ["men", "women", "kids", "unisex"]).notNull(),
    category: mysqlEnum("category", [
      "shoes",
      "training",
      "jackets",
      "hoodies",
      "pants",
      "shorts",
      "tees",
      "sets",
      "accessories",
    ]).notNull(),
    brand: varchar("brand", { length: 64 }),
    basePriceCents: int("basePriceCents").notNull(),
    compareAtPriceCents: int("compareAtPriceCents"),
    status: mysqlEnum("status", ["draft", "active", "archived"]).default("draft").notNull(),
    isNew: boolean("isNew").default(false).notNull(),
    isTrending: boolean("isTrending").default(false).notNull(),
    rbmsoftItemId: varchar("rbmsoftItemId", { length: 64 }),
    metaTitle: varchar("metaTitle", { length: 200 }),
    metaDescription: varchar("metaDescription", { length: 300 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("products_status_idx").on(t.status),
    categoryIdx: index("products_category_idx").on(t.category),
    audienceIdx: index("products_audience_idx").on(t.audience),
    rbmsoftItemIdx: index("products_rbmsoft_item_idx").on(t.rbmsoftItemId),
  }),
);

// The sellable unit (barcode-first): a product in a specific color + size.
export const productVariants = mysqlTable(
  "product_variants",
  {
    id: serial("id").primaryKey(),
    productId: bigint("productId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 64 }).notNull().unique(),
    barcode: varchar("barcode", { length: 64 }).notNull(),
    color: varchar("color", { length: 48 }).notNull(),
    colorHex: char("colorHex", { length: 7 }),
    size: varchar("size", { length: 16 }).notNull(), // '42', 'M', '4Y'…
    sizeType: mysqlEnum("sizeType", ["shoe", "apparel", "kids"]).notNull(),
    priceOverrideCents: int("priceOverrideCents"),
    rbmsoftVariantId: varchar("rbmsoftVariantId", { length: 64 }),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => ({
    barcodeIdx: uniqueIndex("product_variants_barcode_idx").on(t.barcode),
    productIdx: index("product_variants_product_idx").on(t.productId),
    rbmsoftVariantIdx: index("product_variants_rbmsoft_variant_idx").on(t.rbmsoftVariantId),
  }),
);

// Cached mirror of RBMsoft stock (+ local manual overrides), per variant per
// branch. Available-for-online = qtyOnHand − reservedOnline (never negative
// in responses).
export const branchStock = mysqlTable(
  "branch_stock",
  {
    id: serial("id").primaryKey(),
    variantId: bigint("variantId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    branchId: bigint("branchId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    qtyOnHand: int("qtyOnHand").default(0).notNull(),
    reservedOnline: int("reservedOnline").default(0).notNull(),
    lowStockThreshold: int("lowStockThreshold").default(2).notNull(),
    lastSyncedAt: datetime("lastSyncedAt"),
    syncSource: mysqlEnum("syncSource", ["rbmsoft", "manual", "seed"]).default("seed").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => ({
    variantBranchIdx: uniqueIndex("branch_stock_variant_branch_idx").on(t.variantId, t.branchId),
    branchIdx: index("branch_stock_branch_idx").on(t.branchId),
  }),
);

// Double-booking prevention: checkout creates `held` rows (TTL 30 min) inside
// a transaction that re-checks availability with row locks; confirm →
// `committed`; cancel/expire → `released` (returns qty). A janitor job
// expires stale holds every 5 min.
export const stockReservations = mysqlTable(
  "stock_reservations",
  {
    id: serial("id").primaryKey(),
    orderId: bigint("orderId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: bigint("variantId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    branchId: bigint("branchId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    qty: int("qty").notNull(),
    status: mysqlEnum("status", ["held", "committed", "released", "expired"])
      .default("held")
      .notNull(),
    expiresAt: datetime("expiresAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    orderIdx: index("stock_reservations_order_idx").on(t.orderId),
    variantIdx: index("stock_reservations_variant_idx").on(t.variantId),
    statusExpiryIdx: index("stock_reservations_status_expiry_idx").on(t.status, t.expiresAt),
  }),
);

// Photos, easiest-possible binding: binding = (productId, color); the variant
// grid derives images from product+color. Primary image = lowest sortOrder.
export const mediaAssets = mysqlTable(
  "media_assets",
  {
    id: serial("id").primaryKey(),
    url: varchar("url", { length: 500 }).notNull(),
    webpUrl: varchar("webpUrl", { length: 500 }),
    width: int("width"),
    height: int("height"),
    sha256: char("sha256", { length: 64 }).notNull().unique(),
    productId: bigint("productId", { mode: "number", unsigned: true }).references(
      () => products.id,
      { onDelete: "cascade" },
    ),
    color: varchar("color", { length: 48 }),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    productColorIdx: index("media_assets_product_color_idx").on(t.productId, t.color),
  }),
);

// ── Customers ────────────────────────────────────────────────────────────────
// Upserted by phone on every order (guest or not).
export const customers = mysqlTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    fullName: varchar("fullName", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 32 }).notNull(),
    whatsapp: varchar("whatsapp", { length: 32 }),
    email: varchar("email", { length: 320 }),
    address: text("address"),
    area: varchar("area", { length: 96 }), // Lebanese area
    notes: text("notes"),
    ordersCount: int("ordersCount").default(0).notNull(),
    totalSpentCents: bigint("totalSpentCents", { mode: "number" }).default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => ({
    phoneIdx: index("customers_phone_idx").on(t.phone),
  }),
);

// ── Orders ───────────────────────────────────────────────────────────────────
export const orders = mysqlTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    orderNumber: varchar("orderNumber", { length: 32 }).notNull().unique(), // SF-0001 sequence
    customerId: bigint("customerId", { mode: "number", unsigned: true }).references(
      () => customers.id,
      { onDelete: "set null" },
    ),
    // Guest snapshot fields (kept even if the customer row later changes).
    guestName: varchar("guestName", { length: 160 }).notNull(),
    guestPhone: varchar("guestPhone", { length: 32 }).notNull(),
    guestAddress: varchar("guestAddress", { length: 255 }),
    guestArea: varchar("guestArea", { length: 96 }),
    fulfilment: mysqlEnum("fulfilment", ["delivery", "pickup"]).notNull(),
    pickupBranchId: bigint("pickupBranchId", { mode: "number", unsigned: true }).references(
      () => branches.id,
      { onDelete: "set null" },
    ),
    deliveryFeeCents: int("deliveryFeeCents").default(300000).notNull(), // $3.00, env-configurable
    subtotalCents: int("subtotalCents").notNull(),
    totalCents: int("totalCents").notNull(),
    paymentMethod: mysqlEnum("paymentMethod", ["cash_on_delivery"])
      .default("cash_on_delivery")
      .notNull(),
    status: mysqlEnum("status", [
      "new",
      "confirmed",
      "preparing",
      "ready_for_pickup",
      "out_for_delivery",
      "delivered",
      "returned",
      "cancelled",
    ])
      .default("new")
      .notNull(),
    needsTransfer: boolean("needsTransfer").default(false).notNull(),
    transferFromBranchId: bigint("transferFromBranchId", {
      mode: "number",
      unsigned: true,
    }).references(() => branches.id, { onDelete: "set null" }),
    metaEventId: varchar("metaEventId", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("orders_status_idx").on(t.status),
    customerIdx: index("orders_customer_idx").on(t.customerId),
    phoneIdx: index("orders_guest_phone_idx").on(t.guestPhone),
  }),
);

export const orderItems = mysqlTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: bigint("orderId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: bigint("variantId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    // Snapshots so order history stays accurate if the catalog changes.
    productName: varchar("productName", { length: 180 }).notNull(),
    color: varchar("color", { length: 48 }).notNull(),
    size: varchar("size", { length: 16 }).notNull(),
    sku: varchar("sku", { length: 64 }).notNull(),
    barcode: varchar("barcode", { length: 64 }).notNull(),
    qty: int("qty").notNull(),
    unitPriceCents: int("unitPriceCents").notNull(),
    // Which branch fulfils this line; may differ from the pickup branch →
    // needsTransfer on the order.
    sourceBranchId: bigint("sourceBranchId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
  },
  (t) => ({
    orderIdx: index("order_items_order_idx").on(t.orderId),
    variantIdx: index("order_items_variant_idx").on(t.variantId),
  }),
);

// ── Branch transfers ─────────────────────────────────────────────────────────
export const branchTransfers = mysqlTable(
  "branch_transfers",
  {
    id: serial("id").primaryKey(),
    transferNumber: varchar("transferNumber", { length: 32 }).notNull().unique(), // TR-0001
    variantId: bigint("variantId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    qty: int("qty").notNull(),
    fromBranchId: bigint("fromBranchId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    toBranchId: bigint("toBranchId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    status: mysqlEnum("status", ["requested", "in_transit", "received", "cancelled"])
      .default("requested")
      .notNull(),
    orderId: bigint("orderId", { mode: "number", unsigned: true }).references(() => orders.id, {
      onDelete: "set null",
    }),
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    receivedAt: timestamp("receivedAt"),
  },
  (t) => ({
    statusIdx: index("branch_transfers_status_idx").on(t.status),
  }),
);

// ── RBMsoft sync ─────────────────────────────────────────────────────────────
export const syncRuns = mysqlTable(
  "sync_runs",
  {
    id: serial("id").primaryKey(),
    driver: varchar("driver", { length: 32 }).notNull(),
    mode: mysqlEnum("mode", ["full", "delta", "webhook"]).notNull(),
    startedAt: datetime("startedAt").notNull(),
    finishedAt: datetime("finishedAt"),
    status: mysqlEnum("status", ["ok", "error", "partial"]).notNull(),
    itemsUpserted: int("itemsUpserted").default(0).notNull(),
    stocksUpdated: int("stocksUpdated").default(0).notNull(),
    error: text("error"),
  },
  (t) => ({
    startedIdx: index("sync_runs_started_idx").on(t.startedAt),
  }),
);

export const syncConflicts = mysqlTable(
  "sync_conflicts",
  {
    id: serial("id").primaryKey(),
    variantId: bigint("variantId", { mode: "number", unsigned: true }).references(
      () => productVariants.id,
      { onDelete: "cascade" },
    ),
    branchId: bigint("branchId", { mode: "number", unsigned: true }).references(
      () => branches.id,
      { onDelete: "cascade" },
    ),
    kind: mysqlEnum("kind", [
      "negative_stock",
      "unknown_barcode",
      "reserved_exceeds_physical",
      "push_failed",
    ]).notNull(),
    detail: json("detail"),
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    unresolvedIdx: index("sync_conflicts_unresolved_idx").on(t.resolvedAt),
  }),
);

// Raised on sync or sale when available ≤ threshold (edge-triggered, once per
// drop).
export const lowStockAlerts = mysqlTable(
  "low_stock_alerts",
  {
    id: serial("id").primaryKey(),
    variantId: bigint("variantId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    branchId: bigint("branchId", { mode: "number", unsigned: true })
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    qtyAtAlert: int("qtyAtAlert").notNull(),
    status: mysqlEnum("status", ["open", "acknowledged"]).default("open").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => ({
    statusIdx: index("low_stock_alerts_status_idx").on(t.status),
  }),
);

// ── Contact messages (public Contact page + WhatsApp follow-up) ─────────────
export const contactMessages = mysqlTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["new", "read", "archived"]).default("new").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ── Newsletter ───────────────────────────────────────────────────────────────
export const newsletterSubscribers = mysqlTable("newsletter_subscribers", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  language: varchar("language", { length: 8 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ── Promotions: simple promo codes + automatic discounts ────────────────────
// Code-based discounts a shopper types at checkout. Value is a percent
// (1-100) when type is "percent", or cents when type is "fixed".
export const promoCodes = mysqlTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  type: mysqlEnum("type", ["percent", "fixed"]).notNull(),
  value: int("value").notNull(),
  minOrderCents: int("minOrderCents"),
  maxUses: int("maxUses"),
  usesCount: int("usesCount").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  startsAt: timestamp("startsAt"),
  expiresAt: timestamp("expiresAt"),
  createdByUserId: bigint("createdByUserId", { mode: "number", unsigned: true }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// Automatic discounts: no code needed, applied at checkout to matching
// items (or the whole order) while active and within its date window.
export const discounts = mysqlTable("discounts", {
  id: serial("id").primaryKey(),
  nameEn: varchar("nameEn", { length: 160 }).notNull(),
  nameAr: varchar("nameAr", { length: 160 }),
  type: mysqlEnum("type", ["percent", "fixed"]).notNull(),
  value: int("value").notNull(),
  appliesTo: mysqlEnum("appliesTo", ["all", "category", "product"]).default("all").notNull(),
  appliesValue: varchar("appliesValue", { length: 160 }),
  active: boolean("active").default(true).notNull(),
  startsAt: timestamp("startsAt"),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

// ── Site settings + audit ────────────────────────────────────────────────────
// Key/value store. Known keys: pixel.enabled (default true),
// pixel.consentRequired (default false = track unless declined),
// delivery.feeCents, store.whatsapp, store.instagram, branch.hours, seo.*.
export const siteSettings = mysqlTable("site_settings", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 120 }).notNull().unique(),
  value: json("value"),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const auditLogs = mysqlTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorUserId: bigint("actorUserId", { mode: "number", unsigned: true }),
  action: varchar("action", { length: 120 }).notNull(),
  entity: varchar("entity", { length: 60 }).notNull(),
  entityId: varchar("entityId", { length: 60 }),
  detail: json("detail"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// ── Types ────────────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Role = User["role"];
export type StaffRole = typeof staffRoles.$inferSelect;
export type Branch = typeof branches.$inferSelect;
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type InsertProductVariant = typeof productVariants.$inferInsert;
export type BranchStock = typeof branchStock.$inferSelect;
export type StockReservation = typeof stockReservations.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type BranchTransfer = typeof branchTransfers.$inferSelect;
export type SyncRun = typeof syncRuns.$inferSelect;
export type SyncConflict = typeof syncConflicts.$inferSelect;
export type LowStockAlert = typeof lowStockAlerts.$inferSelect;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type NewsletterSubscriber = typeof newsletterSubscribers.$inferSelect;
export type PromoCode = typeof promoCodes.$inferSelect;
export type Discount = typeof discounts.$inferSelect;
export type SiteSetting = typeof siteSettings.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
