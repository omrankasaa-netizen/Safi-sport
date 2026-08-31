import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "../../queries/connection";
import { env } from "../../lib/env";
import { createMockDriver } from "./mockDriver";
import { createHttpDriver } from "./httpDriver";
import type { InventoryProvider, PushSaleOrder } from "./types";

/**
 * RBMsoft sync service (SPEC §3): full sync (nightly + manual), delta sync
 * (every 5 min), webhook-triggered sync of given barcodes, and a janitor for
 * expired stock reservations. Barcode is the identity key. Every run writes
 * a sync_runs row + an audit_logs entry; anomalies land in sync_conflicts.
 */

let driver: InventoryProvider | undefined;

export function getDriver(): InventoryProvider {
  if (!driver) {
    driver = env.rbmsoftDriver === "http" ? createHttpDriver() : createMockDriver();
  }
  return driver;
}

/** Test hook: inject a fake driver. */
export function setDriverForTests(d: InventoryProvider | undefined) {
  driver = d;
}

export type SyncMode = "full" | "delta" | "webhook";

export async function runSync(mode: SyncMode, opts: { barcodes?: string[] } = {}) {
  const db = getDb();
  const provider = getDriver();
  const startedAt = new Date();
  let itemsUpserted = 0;
  let stocksUpdated = 0;
  let status: "ok" | "error" | "partial" = "ok";
  let errorText: string | null = null;

  const [run] = await db
    .insert(schema.syncRuns)
    .values({ driver: provider.name, mode, startedAt, status: "ok" })
    .$returningId();
  const runId = run.id;

  try {
    const since = mode === "delta" ? new Date(Date.now() - 15 * 60 * 1000) : undefined;

    // ── Items → products/variants (identity = barcode) ──────────────────
    const items = await provider.fetchItems(since);
    const itemFilter = opts.barcodes?.length ? new Set(opts.barcodes) : null;
    for (const item of items) {
      if (itemFilter && !itemFilter.has(item.barcode)) continue;
      const [variant] = await db
        .select()
        .from(schema.productVariants)
        .where(eq(schema.productVariants.barcode, item.barcode))
        .limit(1);
      if (!variant) {
        // Barcode the POS knows but we don't: surface it, don't guess.
        await recordConflict({ kind: "unknown_barcode", detail: { barcode: item.barcode, name: item.name } });
        status = "partial";
        continue;
      }
      // Keep our price in step with the POS unless the variant has a local
      // price override.
      if (variant.priceOverrideCents == null) {
        const [product] = await db
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, variant.productId))
          .limit(1);
        if (product && product.basePriceCents !== item.priceCents) {
          await db
            .update(schema.products)
            .set({ basePriceCents: item.priceCents, updatedAt: new Date() })
            .where(eq(schema.products.id, product.id));
        }
        if (product && !product.rbmsoftItemId) {
          await db
            .update(schema.products)
            .set({ rbmsoftItemId: item.itemId, updatedAt: new Date() })
            .where(eq(schema.products.id, product.id));
        }
      }
      if (!variant.rbmsoftVariantId) {
        await db
          .update(schema.productVariants)
          .set({ rbmsoftVariantId: `${item.itemId}:${item.barcode}`, updatedAt: new Date() })
          .where(eq(schema.productVariants.id, variant.id));
      }
      itemsUpserted += 1;
    }

    // ── Stock rows → branch_stock (skip manual overrides) ───────────────
    const stockRows = await provider.fetchStock(since);
    const stockFilter = opts.barcodes?.length ? new Set(opts.barcodes) : null;
    for (const row of stockRows) {
      if (stockFilter && !stockFilter.has(row.barcode)) continue;

      const [variant] = await db
        .select()
        .from(schema.productVariants)
        .where(eq(schema.productVariants.barcode, row.barcode))
        .limit(1);
      if (!variant) {
        await recordConflict({ kind: "unknown_barcode", detail: { barcode: row.barcode, branchCode: row.branchCode } });
        status = "partial";
        continue;
      }
      const [branch] = await db
        .select()
        .from(schema.branches)
        .where(eq(schema.branches.code, row.branchCode))
        .limit(1);
      if (!branch) continue; // POS branch we don't operate — ignore.

      let qty = row.qty;
      if (qty < 0) {
        await recordConflict({
          variantId: variant.id,
          branchId: branch.id,
          kind: "negative_stock",
          detail: { barcode: row.barcode, qty: row.qty },
        });
        qty = 0;
        status = "partial";
      }

      const [existing] = await db
        .select()
        .from(schema.branchStock)
        .where(and(eq(schema.branchStock.variantId, variant.id), eq(schema.branchStock.branchId, branch.id)))
        .limit(1);

      // Manual overrides win: sync must not stomp a qty a human set until
      // the override is released (syncSource back to 'rbmsoft').
      if (existing && existing.syncSource === "manual") continue;

      const now = new Date();
      if (!existing) {
        await db.insert(schema.branchStock).values({
          variantId: variant.id,
          branchId: branch.id,
          qtyOnHand: qty,
          reservedOnline: 0,
          lastSyncedAt: now,
          syncSource: "rbmsoft",
        });
        await maybeRaiseLowStock(variant.id, branch.id, qty, 2);
        stocksUpdated += 1;
        continue;
      }

      const prevAvailable = existing.qtyOnHand - existing.reservedOnline;
      await db
        .update(schema.branchStock)
        .set({ qtyOnHand: qty, lastSyncedAt: now, syncSource: "rbmsoft", updatedAt: now })
        .where(eq(schema.branchStock.id, existing.id));

      const newAvailable = qty - existing.reservedOnline;
      if (existing.reservedOnline > qty) {
        await recordConflict({
          variantId: variant.id,
          branchId: branch.id,
          kind: "reserved_exceeds_physical",
          detail: { barcode: row.barcode, reservedOnline: existing.reservedOnline, qtyOnHand: qty },
        });
        status = "partial";
      }
      // Edge-triggered: only alert when availability CROSSES to ≤ threshold.
      if (newAvailable <= existing.lowStockThreshold && prevAvailable > existing.lowStockThreshold) {
        await maybeRaiseLowStock(variant.id, branch.id, newAvailable, existing.lowStockThreshold);
      }
      stocksUpdated += 1;
    }

    // Push confirmed-but-unpushed orders, if the driver supports write-back.
    if (provider.pushSale) {
      await pushConfirmedOrders(provider).catch(async (e) => {
        console.error("[sync] pushConfirmedOrders failed:", e);
        status = "partial";
      });
    }
  } catch (error) {
    status = "error";
    errorText = error instanceof Error ? error.message : String(error);
    console.error("[sync] run failed:", error);
  }

  await db
    .update(schema.syncRuns)
    .set({ finishedAt: new Date(), status, itemsUpserted, stocksUpdated, error: errorText })
    .where(eq(schema.syncRuns.id, runId));

  await db.insert(schema.auditLogs).values({
    actorUserId: null,
    action: `sync.${mode}`,
    entity: "sync_run",
    entityId: String(runId),
    detail: { driver: provider.name, status, itemsUpserted, stocksUpdated, error: errorText },
  });

  return { runId, status, itemsUpserted, stocksUpdated, error: errorText };
}

async function recordConflict(data: {
  variantId?: number;
  branchId?: number;
  kind: "negative_stock" | "unknown_barcode" | "reserved_exceeds_physical" | "push_failed";
  detail?: Record<string, unknown>;
}) {
  const db = getDb();
  await db.insert(schema.syncConflicts).values({
    variantId: data.variantId ?? null,
    branchId: data.branchId ?? null,
    kind: data.kind,
    detail: data.detail ?? null,
  });
}

/** Inserts a low-stock alert unless one is already open for this
 *  variant+branch (edge-triggered, once per drop). */
async function maybeRaiseLowStock(variantId: number, branchId: number, available: number, _threshold: number) {
  const db = getDb();
  const [open] = await db
    .select()
    .from(schema.lowStockAlerts)
    .where(
      and(
        eq(schema.lowStockAlerts.variantId, variantId),
        eq(schema.lowStockAlerts.branchId, branchId),
        eq(schema.lowStockAlerts.status, "open"),
      ),
    )
    .limit(1);
  if (open) return;
  await db.insert(schema.lowStockAlerts).values({ variantId, branchId, qtyAtAlert: Math.max(0, available) });
}

/** Janitor: expires `held` reservations past their TTL and returns the qty
 *  to the available pool (SPEC §2 stock_reservations). */
export async function expireStaleReservations(now = new Date()): Promise<number> {
  const db = getDb();
  const stale = await db
    .select()
    .from(schema.stockReservations)
    .where(and(eq(schema.stockReservations.status, "held"), lte(schema.stockReservations.expiresAt, now)));

  let expired = 0;
  for (const r of stale) {
    await db
      .update(schema.stockReservations)
      .set({ status: "expired" })
      .where(and(eq(schema.stockReservations.id, r.id), eq(schema.stockReservations.status, "held")));
    await db
      .update(schema.branchStock)
      .set({ reservedOnline: sql`GREATEST(0, ${schema.branchStock.reservedOnline} - ${r.qty})`, updatedAt: now })
      .where(and(eq(schema.branchStock.variantId, r.variantId), eq(schema.branchStock.branchId, r.branchId)));
    expired += 1;
  }
  if (expired > 0) {
    await db.insert(schema.auditLogs).values({
      actorUserId: null,
      action: "sync.reservations_expired",
      entity: "stock_reservation",
      entityId: null,
      detail: { count: expired },
    });
  }
  return expired;
}

/** Pushes confirmed orders to RBMsoft when the driver supports write-back.
 *  Already-pushed orders are skipped (tracked via audit_logs); failures land
 *  in sync_conflicts as push_failed. */
async function pushConfirmedOrders(provider: InventoryProvider): Promise<void> {
  if (!provider.pushSale) return;
  const db = getDb();

  const confirmed = await db
    .select()
    .from(schema.orders)
    .where(eq(schema.orders.status, "confirmed"))
    .limit(50);
  if (confirmed.length === 0) return;

  const pushedRows = await db
    .select({ entityId: schema.auditLogs.entityId })
    .from(schema.auditLogs)
    .where(eq(schema.auditLogs.action, "sync.sale_pushed"));
  const pushed = new Set(pushedRows.map((r) => r.entityId));

  const failedRows = await db
    .select({ detail: schema.syncConflicts.detail })
    .from(schema.syncConflicts)
    .where(and(eq(schema.syncConflicts.kind, "push_failed"), isNull(schema.syncConflicts.resolvedAt)));
  const failedOrderNumbers = new Set(
    failedRows.map((r) => (r.detail as { orderNumber?: string } | null)?.orderNumber).filter(Boolean),
  );

  for (const order of confirmed) {
    if (pushed.has(order.orderNumber) || failedOrderNumbers.has(order.orderNumber)) continue;
    const items = await db
      .select()
      .from(schema.orderItems)
      .where(inArray(schema.orderItems.orderId, [order.id]));
    const payload: PushSaleOrder = {
      orderNumber: order.orderNumber,
      totalCents: order.totalCents,
      items: items.map((i) => ({ barcode: i.barcode, qty: i.qty, unitPriceCents: i.unitPriceCents })),
    };
    try {
      const result = await provider.pushSale(payload);
      if (!result.ok) throw new Error(`pushSale returned not-ok for ${order.orderNumber}`);
      await db.insert(schema.auditLogs).values({
        actorUserId: null,
        action: "sync.sale_pushed",
        entity: "order",
        entityId: order.orderNumber,
        detail: { externalId: result.externalId ?? null },
      });
    } catch (error) {
      await recordConflict({
        kind: "push_failed",
        detail: {
          orderNumber: order.orderNumber,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
