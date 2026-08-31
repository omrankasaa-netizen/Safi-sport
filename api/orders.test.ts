import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "./router";
import type { TrpcContext } from "./context";
import type { User } from "@db/schema";
import {
  availableOf,
  OutOfStockError,
  planFulfilment,
  type StockLine,
} from "./lib/availability";
import { assertTransition, canTransition, InvalidTransitionError, transitionEffect } from "./lib/orderPipeline";

/**
 * API layer invariants (SPEC §4/§7), run without a database:
 *  1. reservation planning prevents double-booking of the last unit,
 *  2. the order pipeline transition guard rejects illegal moves,
 *  3. role middleware denies staff access to owner-only financials.
 */

describe("planFulfilment (double-booking prevention)", () => {
  const stock = (): StockLine[] => [
    { variantId: 1, branchId: 10, qtyOnHand: 1, reservedOnline: 0 }, // last unit at preferred branch
    { variantId: 1, branchId: 20, qtyOnHand: 0, reservedOnline: 0 },
  ];

  it("lets exactly one of two competing checkouts reserve the last unit", () => {
    const shared = stock();
    const first = planFulfilment([{ variantId: 1, qty: 1 }], shared, 10);
    expect(first.lines[0].sourceBranchId).toBe(10);
    // The first plan has consumed the unit; a second concurrent checkout
    // re-checking the same (row-locked) stock must fail.
    expect(() => planFulfilment([{ variantId: 1, qty: 1 }], shared, 10)).toThrow(OutOfStockError);
  });

  it("falls back to the other branch and flags needsTransfer", () => {
    const shared: StockLine[] = [
      { variantId: 1, branchId: 10, qtyOnHand: 0, reservedOnline: 0 },
      { variantId: 1, branchId: 20, qtyOnHand: 3, reservedOnline: 1 },
    ];
    const plan = planFulfilment([{ variantId: 1, qty: 2 }], shared, 10);
    expect(plan.needsTransfer).toBe(true);
    expect(plan.transferFromBranchId).toBe(20);
    expect(plan.lines[0].needsTransfer).toBe(true);
  });

  it("never counts reserved stock as available and never goes negative", () => {
    expect(availableOf({ qtyOnHand: 0, reservedOnline: 5 })).toBe(0);
    expect(availableOf({ qtyOnHand: 4, reservedOnline: 1 })).toBe(3);
  });

  it("aggregates duplicate lines for the same variant before checking", () => {
    const shared: StockLine[] = [{ variantId: 1, branchId: 10, qtyOnHand: 3, reservedOnline: 0 }];
    expect(() =>
      planFulfilment([{ variantId: 1, qty: 2 }, { variantId: 1, qty: 2 }], shared, 10),
    ).toThrow(OutOfStockError);
    const ok = planFulfilment([{ variantId: 1, qty: 2 }, { variantId: 1, qty: 1 }], shared, 10);
    expect(ok.lines[0].qty).toBe(3);
  });
});

describe("order pipeline transition guard", () => {
  it("walks the happy path new → confirmed → preparing → delivered", () => {
    expect(canTransition("new", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "preparing")).toBe(true);
    expect(canTransition("preparing", "ready_for_pickup")).toBe(true);
    expect(canTransition("preparing", "out_for_delivery")).toBe(true);
    expect(canTransition("out_for_delivery", "delivered")).toBe(true);
    expect(canTransition("delivered", "returned")).toBe(true);
  });

  it("rejects skipping steps, backwards moves, and moves out of terminal states", () => {
    for (const [from, to] of [
      ["new", "delivered"],
      ["new", "preparing"],
      ["confirmed", "new"],
      ["delivered", "confirmed"],
      ["cancelled", "confirmed"],
      ["returned", "delivered"],
    ] as const) {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
    }
  });

  it("maps transitions to reservation side effects", () => {
    expect(transitionEffect("new", "confirmed")).toBe("commit");
    expect(transitionEffect("preparing", "cancelled")).toBe("release");
    expect(transitionEffect("out_for_delivery", "returned")).toBe("restock");
    expect(transitionEffect("confirmed", "preparing")).toBe("none");
  });
});

describe("role guards", () => {
  function ctxFor(role: User["role"] | null): TrpcContext {
    return {
      req: new Request("http://localhost/api/trpc", { headers: { "x-forwarded-for": "1.2.3.4" } }),
      resHeaders: new Headers(),
      clientIp: "1.2.3.4",
      user: role
        ? ({ id: 1, unionId: "email:t@example.com", email: "t@example.com", role } as User)
        : undefined,
    } as TrpcContext;
  }

  function expectTrpcError(err: unknown, code: string) {
    expect(err).toBeInstanceOf(TRPCError);
    expect((err as TRPCError).code).toBe(code);
  }

  it("denies staff access to reports.financials (owner-only)", async () => {
    const caller = appRouter.createCaller(ctxFor("staff"));
    await caller.reports.financials({ days: 30 }).then(
      () => expect.unreachable("staff must not read financials"),
      (err) => expectTrpcError(err, "FORBIDDEN"),
    );
  });

  it("denies unauthenticated calls to staff endpoints", async () => {
    const caller = appRouter.createCaller(ctxFor(null));
    await caller.orders.list({ page: 1, pageSize: 20 }).then(
      () => expect.unreachable(),
      (err) => expectTrpcError(err, "UNAUTHORIZED"),
    );
  });

  it("denies viewers access to users.list (owner-only)", async () => {
    const caller = appRouter.createCaller(ctxFor("viewer"));
    await caller.users.list().then(
      () => expect.unreachable(),
      (err) => expectTrpcError(err, "FORBIDDEN"),
    );
  });

  it("lets a manager reach manager-level guards (fails later on missing DB, not on role)", async () => {
    const caller = appRouter.createCaller(ctxFor("manager"));
    // The guard must pass; the handler then fails on the missing database.
    // Anything except FORBIDDEN/UNAUTHORIZED proves the role gate opened.
    await caller.reports.pendingOrdersCount().then(
      () => {},
      (err) => {
        if (err instanceof TRPCError) {
          expect(["FORBIDDEN", "UNAUTHORIZED"]).not.toContain(err.code);
        }
      },
    );
  });
});
