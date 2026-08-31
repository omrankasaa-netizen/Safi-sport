import type { RbmsoftItem, RbmsoftStockRow } from "./types";

/**
 * Field mapping between the real RBMsoft REST payloads (exact API TBD) and
 * our internal shapes. When RBMsoft API details arrive, only this mapping +
 * the env endpoint paths should need changes — no driver code edits.
 *
 * Each entry lists candidate keys tried in order against a raw record.
 */
export const ITEM_FIELD_MAP = {
  itemId: ["itemId", "item_id", "id", "ItemId", "Code"],
  barcode: ["barcode", "barCode", "Barcode", "ean", "ean13", "SKU"],
  name: ["name", "itemName", "ItemName", "description", "Description"],
  color: ["color", "Color", "colour"],
  size: ["size", "Size"],
  priceCents: ["priceCents", "price_cents"],
  price: ["price", "Price", "retailPrice", "salePrice"], // major units → ×100
  category: ["category", "Category", "group", "Group"],
} as const;

export const STOCK_FIELD_MAP = {
  barcode: ["barcode", "barCode", "Barcode", "ean", "ean13", "SKU"],
  branchCode: ["branchCode", "branch_code", "branch", "Branch", "store", "storeCode"],
  qty: ["qty", "quantity", "Qty", "Quantity", "onHand", "qtyOnHand", "available"],
} as const;

type Raw = Record<string, unknown>;

function pick(raw: Raw, keys: readonly string[]): unknown {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null && raw[k] !== "") return raw[k];
  }
  return undefined;
}

function asNumber(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

export function mapRawItem(raw: Raw): RbmsoftItem | null {
  const barcode = pick(raw, ITEM_FIELD_MAP.barcode);
  const itemId = pick(raw, ITEM_FIELD_MAP.itemId) ?? barcode;
  const name = pick(raw, ITEM_FIELD_MAP.name);
  if (barcode == null || name == null) return null;

  let priceCents = asNumber(pick(raw, ITEM_FIELD_MAP.priceCents));
  if (priceCents == null) {
    const price = asNumber(pick(raw, ITEM_FIELD_MAP.price));
    priceCents = price == null ? 0 : Math.round(price * 100);
  }

  return {
    itemId: String(itemId),
    barcode: String(barcode),
    name: String(name),
    color: pick(raw, ITEM_FIELD_MAP.color)?.toString(),
    size: pick(raw, ITEM_FIELD_MAP.size)?.toString(),
    priceCents: Math.round(priceCents),
    category: pick(raw, ITEM_FIELD_MAP.category)?.toString(),
  };
}

export function mapRawStock(raw: Raw): RbmsoftStockRow | null {
  const barcode = pick(raw, STOCK_FIELD_MAP.barcode);
  const branchCode = pick(raw, STOCK_FIELD_MAP.branchCode);
  const qty = asNumber(pick(raw, STOCK_FIELD_MAP.qty));
  if (barcode == null || branchCode == null || qty == null) return null;
  return { barcode: String(barcode), branchCode: String(branchCode).toLowerCase(), qty: Math.trunc(qty) };
}
