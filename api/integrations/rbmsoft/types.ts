/** RBMsoft integration types (SPEC §3). Barcode is the identity key. */

export type RbmsoftItem = {
  itemId: string;
  barcode: string;
  name: string;
  color?: string;
  size?: string;
  priceCents: number;
  category?: string;
};

export type RbmsoftStockRow = {
  barcode: string;
  branchCode: string;
  qty: number;
};

export type PushSaleResult = { ok: boolean; externalId?: string };

/** Minimal order shape a driver needs for write-back. */
export type PushSaleOrder = {
  orderNumber: string;
  totalCents: number;
  items: { barcode: string; qty: number; unitPriceCents: number }[];
};

export interface InventoryProvider {
  readonly name: string;
  /** Full catalog when `since` is omitted; changed items otherwise. */
  fetchItems(since?: Date): Promise<RbmsoftItem[]>;
  fetchStock(since?: Date): Promise<RbmsoftStockRow[]>;
  /** Optional — many POS won't support write-back. */
  pushSale?(order: PushSaleOrder): Promise<PushSaleResult>;
}
