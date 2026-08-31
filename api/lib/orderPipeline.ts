import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from "@contracts/constants";

/**
 * Pure order-pipeline rules (SPEC §4 orders.*). The status router procedure
 * wraps these in a transaction; keeping them pure makes the transition guard
 * unit-testable without a database.
 */

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return (ORDER_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

export class InvalidTransitionError extends Error {
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`INVALID_TRANSITION:${from}->${to}`);
    this.name = "InvalidTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

/**
 * Stock-reservation side effect of a transition:
 *  - "commit":   → confirmed: held → committed, qtyOnHand -= qty, reservedOnline -= qty
 *  - "release":  → cancelled: held → released (reservedOnline -= qty);
 *                already-committed reservations also return qtyOnHand
 *  - "restock":  → returned: committed → released, qtyOnHand += qty
 *  - "none":     pure status moves
 */
export type TransitionEffect = "commit" | "release" | "restock" | "none";

export function transitionEffect(_from: OrderStatus, to: OrderStatus): TransitionEffect {
  if (to === "confirmed") return "commit";
  if (to === "cancelled") return "release";
  if (to === "returned") return "restock";
  return "none";
}
