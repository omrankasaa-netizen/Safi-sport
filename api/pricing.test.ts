import { describe, expect, it } from "vitest";
import {
  discountAmountCents,
  isWithinWindow,
  matchesDiscount,
  pickAutomaticDiscount,
  type DiscountRow,
} from "./lib/pricing";

/**
 * Unit tests for the money math checkout depends on: discount amounts and
 * discount matching/stacking. These run without a database — pure functions
 * only.
 */

describe("discountAmountCents", () => {
  it("computes percent discounts rounded to the nearest cent", () => {
    expect(discountAmountCents({ type: "percent", value: 10 }, 3500)).toBe(350);
    expect(discountAmountCents({ type: "percent", value: 15 }, 3333)).toBe(500); // 499.95 → 500
    expect(discountAmountCents({ type: "percent", value: 100 }, 2000)).toBe(2000);
  });

  it("never lets a fixed discount exceed the line total", () => {
    expect(discountAmountCents({ type: "fixed", value: 500 }, 3000)).toBe(500);
    expect(discountAmountCents({ type: "fixed", value: 5000 }, 3000)).toBe(3000);
  });

  it("handles zero bases without going negative", () => {
    expect(discountAmountCents({ type: "percent", value: 50 }, 0)).toBe(0);
    expect(discountAmountCents({ type: "fixed", value: 500 }, 0)).toBe(0);
  });
});

describe("matchesDiscount", () => {
  const base = { appliesTo: "all", appliesValue: null } as DiscountRow;
  const line = { category: "tees", productId: "7", lineTotalCents: 3500 };

  it("matches everything when appliesTo is 'all'", () => {
    expect(matchesDiscount(base, line)).toBe(true);
  });

  it("matches categories exactly", () => {
    const d = { ...base, appliesTo: "category", appliesValue: "tees" } as DiscountRow;
    expect(matchesDiscount(d, line)).toBe(true);
    expect(matchesDiscount({ ...d, appliesValue: "hoodies" }, line)).toBe(false);
  });

  it("matches products exactly (no fuzzy/partial matching)", () => {
    const d = { ...base, appliesTo: "product", appliesValue: "7" } as DiscountRow;
    expect(matchesDiscount(d, line)).toBe(true);
    expect(matchesDiscount({ ...d, appliesValue: "8" }, line)).toBe(false);
    expect(matchesDiscount({ ...d, appliesValue: "1" }, line)).toBe(false);
  });
});

describe("pickAutomaticDiscount", () => {
  const line = { category: "tees", productId: "7", lineTotalCents: 3500 };
  const mk = (over: Partial<DiscountRow>) =>
    ({ appliesTo: "all", appliesValue: null, startsAt: null, expiresAt: null, ...over }) as DiscountRow;

  it("returns null when nothing matches", () => {
    const d = mk({ appliesTo: "category", appliesValue: "hoodies", type: "percent", value: 50 });
    expect(pickAutomaticDiscount([d], line)).toBeNull();
  });

  it("skips discounts outside their active window", () => {
    const future = mk({ type: "percent", value: 90, startsAt: new Date(Date.now() + 86400_000) });
    expect(pickAutomaticDiscount([future], line)).toBeNull();
  });

  it("picks the largest discount, not the first match", () => {
    const small = mk({ type: "percent", value: 10 }); // 350
    const big = mk({ type: "percent", value: 20 }); // 700
    const fixed = mk({ type: "fixed", value: 650 }); // 650
    const best = pickAutomaticDiscount([small, big, fixed], line);
    expect(best?.amountCents).toBe(700);
    expect(best?.discount).toBe(big);
  });
});

describe("isWithinWindow", () => {
  const now = new Date("2026-08-27T12:00:00Z");

  it("treats null bounds as open", () => {
    expect(isWithinWindow(null, null, now)).toBe(true);
  });

  it("respects start and end bounds", () => {
    expect(isWithinWindow(new Date("2026-08-28T00:00:00Z"), null, now)).toBe(false);
    expect(isWithinWindow(null, new Date("2026-08-26T00:00:00Z"), now)).toBe(false);
    expect(isWithinWindow(new Date("2026-08-26T00:00:00Z"), new Date("2026-08-28T00:00:00"), now)).toBe(true);
  });
});
