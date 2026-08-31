export const Session = {
  cookieName: "safi_sid",
  // 7-day expiry with sliding refresh (down from Kharbesh's 1 year).
  maxAgeMs: 7 * 24 * 60 * 60 * 1000,
} as const;

export const ErrorMessages = {
  unauthenticated: "Authentication required",
  insufficientRole: "Insufficient permissions",
} as const;

export const Paths = {
  login: "/admin/login",
  googleOauthStart: "/api/auth/google/start",
  googleOauthCallback: "/api/auth/google/callback",
  rbmsoftStockWebhook: "/webhooks/rbmsoft/stock",
} as const;

// ── SAFI domain constants shared by api and src ──────────────────────────────

/** Role hierarchy levels: viewer(0) < staff(1) < manager(2) < owner(3). */
export const ROLE_LEVEL = {
  viewer: 0,
  staff: 1,
  manager: 2,
  owner: 3,
} as const;
export type RoleName = keyof typeof ROLE_LEVEL;

export const ROLE_LABELS: Record<RoleName, string> = {
  viewer: "Viewer — can look at the dashboard, nothing else",
  staff: "Staff — can manage orders, products, photos and transfers. Cannot see money reports.",
  manager: "Manager — everything staff can do, plus reports, customers and promo codes",
  owner: "Owner — full access, including settings, users and financial reports",
};

export const BRANCH_CODES = ["elmina", "dam"] as const;
export type BranchCode = (typeof BRANCH_CODES)[number];

export const AUDIENCES = ["men", "women", "kids", "unisex"] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_LABELS: Record<Audience, string> = {
  men: "Men",
  women: "Women",
  kids: "Kids",
  unisex: "Unisex",
};

export const CATEGORIES = [
  "shoes",
  "training",
  "jackets",
  "hoodies",
  "pants",
  "shorts",
  "tees",
  "sets",
  "accessories",
] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  shoes: "Shoes",
  training: "Training",
  jackets: "Jackets",
  hoodies: "Hoodies",
  pants: "Pants",
  shorts: "Shorts",
  tees: "Tees",
  sets: "Sets",
  accessories: "Accessories",
};

export const SIZE_TYPES = ["shoe", "apparel", "kids"] as const;
export type SizeType = (typeof SIZE_TYPES)[number];
export const SHOE_SIZES = ["40", "41", "42", "43", "44", "45"] as const;
export const APPAREL_SIZES = ["S", "M", "L", "XL"] as const;
export const KIDS_SIZES = ["4Y", "6Y", "8Y", "10Y", "12Y", "14Y"] as const;

/** Order pipeline, in the order staff move an order through it. */
export const ORDER_STATUSES = [
  "new",
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
  "returned",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Plain-language labels for the SAFI order pipeline. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Ready for pickup",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
};

/** Allowed forward transitions in the order pipeline (enforced server-side). */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready_for_pickup", "out_for_delivery", "cancelled"],
  ready_for_pickup: ["delivered", "cancelled"],
  out_for_delivery: ["delivered", "returned"],
  delivered: ["returned"],
  returned: [],
  cancelled: [],
};

export const TRANSFER_STATUSES = ["requested", "in_transit", "received", "cancelled"] as const;
export type TransferStatus = (typeof TRANSFER_STATUSES)[number];
export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  requested: "Requested",
  in_transit: "On the way",
  received: "Received",
  cancelled: "Cancelled",
};

/** How long a checkout stock reservation stays "held" before the janitor
 *  expires it. */
export const RESERVATION_TTL_MS = 30 * 60 * 1000;
/** Janitor + delta-sync cadence. */
export const SYNC_DELTA_INTERVAL_MS = 5 * 60 * 1000;

export const DEFAULT_DELIVERY_FEE_CENTS = 300000; // $3.00
export const CURRENCY = "USD";
export const STORE_WHATSAPP = "+96181498942";
