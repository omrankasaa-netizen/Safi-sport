/**
 * Pure availability / reservation-planning math for SAFI SPORT.
 *
 * Kept DB-free so the double-booking invariant is unit-testable
 * (api/orders.test.ts): the checkout transaction loads branch_stock rows
 * with SELECT ... FOR UPDATE, feeds them to planFulfilment(), and applies
 * the returned plan — so two concurrent checkouts over the same locked row
 * can never both succeed on the last unit.
 */

export type StockLine = {
  variantId: number;
  branchId: number;
  qtyOnHand: number;
  reservedOnline: number;
};

/** Available-for-online = qtyOnHand − reservedOnline, never negative. */
export function availableOf(line: Pick<StockLine, "qtyOnHand" | "reservedOnline">): number {
  return Math.max(0, line.qtyOnHand - line.reservedOnline);
}

export type FulfilmentRequest = { variantId: number; qty: number };

export type FulfilmentPlanLine = {
  variantId: number;
  qty: number;
  /** Branch that fulfils this line. */
  sourceBranchId: number;
  /** True when the line had to be sourced from a non-preferred branch. */
  needsTransfer: boolean;
};

export type FulfilmentPlan = {
  lines: FulfilmentPlanLine[];
  /** True when any line is sourced away from the preferred branch. */
  needsTransfer: boolean;
  /** First non-preferred source branch (order.transferFromBranchId). */
  transferFromBranchId: number | null;
};

export class OutOfStockError extends Error {
  readonly variantId: number;
  constructor(variantId: number) {
    super(`OUT_OF_STOCK:${variantId}`);
    this.name = "OutOfStockError";
    this.variantId = variantId;
  }
}

/**
 * Choose a source branch per item: preferred branch first (pickup branch, or
 * the delivery default 'elmina'), falling back to any other branch that can
 * cover the full qty (→ needsTransfer). Throws OutOfStockError when no
 * branch can fulfil a line.
 *
 * The plan is computed against (and applied to) the mutable `stock` list so
 * two items sharing a variant, or two sequential checkouts in a test, see
 * the second request fail once the first has consumed the last unit.
 */
export function planFulfilment(
  items: FulfilmentRequest[],
  stock: StockLine[],
  preferredBranchId: number,
): FulfilmentPlan {
  // Aggregate identical variants first so two lines for the same variant
  // are checked against their combined qty, not independently.
  const wanted = new Map<number, number>();
  for (const item of items) {
    if (item.qty <= 0) throw new OutOfStockError(item.variantId);
    wanted.set(item.variantId, (wanted.get(item.variantId) ?? 0) + item.qty);
  }

  const lines: FulfilmentPlanLine[] = [];
  let needsTransfer = false;
  let transferFromBranchId: number | null = null;

  for (const [variantId, qty] of wanted) {
    const rows = stock
      .filter((s) => s.variantId === variantId)
      .sort((a, b) => (a.branchId === preferredBranchId ? -1 : b.branchId === preferredBranchId ? 1 : a.branchId - b.branchId));
    const source = rows.find((r) => availableOf(r) >= qty);
    if (!source) throw new OutOfStockError(variantId);
    // Consume the reservation immediately so later lines (and later
    // sequential plans over the same stock array) see it gone.
    source.reservedOnline += qty;
    const away = source.branchId !== preferredBranchId;
    if (away) {
      needsTransfer = true;
      transferFromBranchId ??= source.branchId;
    }
    lines.push({ variantId, qty, sourceBranchId: source.branchId, needsTransfer: away });
  }

  return { lines, needsTransfer, transferFromBranchId };
}

/** Roll back a plan against a stock array (test helper / symmetry). */
export function unapplyPlan(plan: FulfilmentPlan, stock: StockLine[]): void {
  for (const line of plan.lines) {
    const row = stock.find((s) => s.variantId === line.variantId && s.branchId === line.sourceBranchId);
    if (row) row.reservedOnline = Math.max(0, row.reservedOnline - line.qty);
  }
}
