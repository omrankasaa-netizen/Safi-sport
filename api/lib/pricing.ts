import type { Discount } from "@db/schema";

/**
 * Pure checkout money math for SAFI SPORT — discount matching/stacking and
 * amount computation. No DB access, so the storefront checkout and the
 * server-side order creation share exactly the same rules and these stay
 * unit-testable (see api/pricing.test.ts).
 */

export type DiscountRow = Pick<
  Discount,
  "type" | "value" | "appliesTo" | "appliesValue" | "startsAt" | "expiresAt"
>;
export type LineForDiscount = {
  /** products.category of the line's product. */
  category: string;
  /** products.id of the line's product, as a string. */
  productId: string;
  lineTotalCents: number;
};

export function isWithinWindow(startsAt: Date | null, expiresAt: Date | null, now = new Date()) {
  if (startsAt && now < startsAt) return false;
  if (expiresAt && now > expiresAt) return false;
  return true;
}

export function matchesDiscount(discount: DiscountRow, line: LineForDiscount) {
  if (discount.appliesTo === "all") return true;
  if (discount.appliesTo === "category") return discount.appliesValue === line.category;
  if (discount.appliesTo === "product") return discount.appliesValue === line.productId;
  return false;
}

export function discountAmountCents(
  discount: { type: "percent" | "fixed"; value: number },
  baseCents: number,
) {
  return discount.type === "percent"
    ? Math.round((baseCents * discount.value) / 100)
    : Math.min(discount.value, baseCents);
}

/** The single best automatic discount for a line (largest amount wins). */
export function pickAutomaticDiscount<T extends DiscountRow>(activeDiscounts: T[], line: LineForDiscount) {
  let best: { discount: T; amountCents: number } | null = null;
  for (const d of activeDiscounts) {
    if (!isWithinWindow(d.startsAt, d.expiresAt)) continue;
    if (!matchesDiscount(d, line)) continue;
    const amountCents = discountAmountCents(d, line.lineTotalCents);
    if (!best || amountCents > best.amountCents) best = { discount: d, amountCents };
  }
  return best;
}
