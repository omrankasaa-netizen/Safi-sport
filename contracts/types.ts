export type * from "../db/schema";
export * from "./errors";

// Domain types shared by api and src. Row types (Branch, Product,
// ProductVariant, BranchStock, Order, OrderItem, BranchTransfer, SyncRun,
// SyncConflict, MediaAsset, Customer, Role…) come from the db schema
// re-export above; status enums + their labels live in ./constants.

import type { BranchStock, Product, ProductVariant } from "../db/schema";

/** A sellable variant joined with its parent product — the shape catalog
 *  and inventory endpoints return. */
export type VariantWithProduct = ProductVariant & { product: Product };

/** Per-branch availability for a variant, as shown on storefront/admin. */
export type BranchAvailability = {
  branchId: number;
  branchCode: string;
  qtyOnHand: number;
  reservedOnline: number;
  /** qtyOnHand − reservedOnline, clamped at 0. */
  available: number;
  syncSource: BranchStock["syncSource"];
  lastSyncedAt: Date | null;
};
