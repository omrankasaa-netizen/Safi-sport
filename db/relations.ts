import { relations } from "drizzle-orm";
import {
  branches,
  branchStock,
  branchTransfers,
  customers,
  lowStockAlerts,
  mediaAssets,
  orderItems,
  orders,
  productVariants,
  products,
  stockReservations,
  syncConflicts,
} from "./schema";

export const branchesRelations = relations(branches, ({ many }) => ({
  stock: many(branchStock),
  reservations: many(stockReservations),
  transfersFrom: many(branchTransfers, { relationName: "transfersFrom" }),
  transfersTo: many(branchTransfers, { relationName: "transfersTo" }),
}));

export const productsRelations = relations(products, ({ many }) => ({
  variants: many(productVariants),
  media: many(mediaAssets),
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  stock: many(branchStock),
  reservations: many(stockReservations),
  orderItems: many(orderItems),
}));

export const branchStockRelations = relations(branchStock, ({ one }) => ({
  variant: one(productVariants, { fields: [branchStock.variantId], references: [productVariants.id] }),
  branch: one(branches, { fields: [branchStock.branchId], references: [branches.id] }),
}));

export const stockReservationsRelations = relations(stockReservations, ({ one }) => ({
  order: one(orders, { fields: [stockReservations.orderId], references: [orders.id] }),
  variant: one(productVariants, {
    fields: [stockReservations.variantId],
    references: [productVariants.id],
  }),
  branch: one(branches, { fields: [stockReservations.branchId], references: [branches.id] }),
}));

export const mediaAssetsRelations = relations(mediaAssets, ({ one }) => ({
  product: one(products, { fields: [mediaAssets.productId], references: [products.id] }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, { fields: [orders.customerId], references: [customers.id] }),
  pickupBranch: one(branches, { fields: [orders.pickupBranchId], references: [branches.id] }),
  items: many(orderItems),
  reservations: many(stockReservations),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  variant: one(productVariants, { fields: [orderItems.variantId], references: [productVariants.id] }),
  sourceBranch: one(branches, { fields: [orderItems.sourceBranchId], references: [branches.id] }),
}));

export const branchTransfersRelations = relations(branchTransfers, ({ one }) => ({
  variant: one(productVariants, {
    fields: [branchTransfers.variantId],
    references: [productVariants.id],
  }),
  fromBranch: one(branches, {
    fields: [branchTransfers.fromBranchId],
    references: [branches.id],
    relationName: "transfersFrom",
  }),
  toBranch: one(branches, {
    fields: [branchTransfers.toBranchId],
    references: [branches.id],
    relationName: "transfersTo",
  }),
  order: one(orders, { fields: [branchTransfers.orderId], references: [orders.id] }),
}));

export const syncConflictsRelations = relations(syncConflicts, ({ one }) => ({
  variant: one(productVariants, {
    fields: [syncConflicts.variantId],
    references: [productVariants.id],
  }),
  branch: one(branches, { fields: [syncConflicts.branchId], references: [branches.id] }),
}));

export const lowStockAlertsRelations = relations(lowStockAlerts, ({ one }) => ({
  variant: one(productVariants, {
    fields: [lowStockAlerts.variantId],
    references: [productVariants.id],
  }),
  branch: one(branches, { fields: [lowStockAlerts.branchId], references: [branches.id] }),
}));
