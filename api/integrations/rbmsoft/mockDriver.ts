import { DEMO_PRODUCTS, demoStockQty } from "./demoCatalog";
import type { InventoryProvider, PushSaleOrder, PushSaleResult, RbmsoftItem, RbmsoftStockRow } from "./types";

/**
 * Deterministic fake RBMsoft catalog built from the SAME 12 demo products the
 * seed inserts — so mock sync is coherent end-to-end without the real API.
 * Selected when SAFI_RBMSOFT_DRIVER=mock (default).
 */
export function createMockDriver(): InventoryProvider {
  const items: RbmsoftItem[] = DEMO_PRODUCTS.flatMap((p) =>
    p.variants.map((v) => ({
      itemId: p.rbmsoftItemId,
      barcode: v.barcode,
      name: `${p.nameEn} — ${v.color} ${v.size}`,
      color: v.color,
      size: v.size,
      priceCents: v.priceOverrideCents ?? p.basePriceCents,
      category: p.category,
    })),
  );

  const stock: RbmsoftStockRow[] = items.flatMap((item) =>
    (["elmina", "dam"] as const).map((branchCode) => ({
      barcode: item.barcode,
      branchCode,
      qty: demoStockQty(item.barcode, branchCode),
    })),
  );

  return {
    name: "mock",
    // The mock catalog never changes, so `since` doesn't filter — full and
    // delta syncs return the same deterministic data.
    fetchItems: async () => items,
    fetchStock: async () => stock,
    pushSale: async (order: PushSaleOrder): Promise<PushSaleResult> => {
      // Deterministic "accepted" response so the push path is exercised in dev.
      return { ok: true, externalId: `MOCK-${order.orderNumber}` };
    },
  };
}
