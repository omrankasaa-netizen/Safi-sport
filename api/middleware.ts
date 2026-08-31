import { ErrorMessages, ROLE_LEVEL, type RoleName } from "@contracts/constants";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const createRouter = t.router;
export const publicQuery = t.procedure;

const requireAuth = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ErrorMessages.unauthenticated,
    });
  }

  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Role hierarchy: viewer(0) < staff(1) < manager(2) < owner(3). Every tier
// inherits everything below it.
function requireMinRole(minLevel: number) {
  return t.middleware(async (opts) => {
    const { ctx, next } = opts;
    const level = ROLE_LEVEL[(ctx.user?.role ?? "viewer") as RoleName] ?? 0;

    if (!ctx.user || level < minLevel) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: ErrorMessages.insufficientRole,
      });
    }

    return next({ ctx: { ...ctx, user: ctx.user } });
  });
}

export const authedQuery = t.procedure.use(requireAuth);
/** Viewer and above: dashboard read-only access (no financials). */
export const viewerQuery = authedQuery.use(requireMinRole(0));
/** Staff and above: orders pipeline, products edit, photos, transfers, inventory view. */
export const staffQuery = authedQuery.use(requireMinRole(1));
/** Manager and above: reports, customers, inventory thresholds, promo codes. */
export const managerQuery = authedQuery.use(requireMinRole(2));
/** Owner only: users/roles, settings, pixel, sync config, financial reports. */
export const ownerQuery = authedQuery.use(requireMinRole(3));
