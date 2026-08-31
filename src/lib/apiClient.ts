/**
 * Vanilla (non-hook) tRPC client for event-style calls that don't belong in
 * React Query's cache: checkout submission, Meta CAPI twins, order tracking.
 * Cookies ride along so the server can read session/_fbp/_fbc.
 */
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../api/router";

export const api = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
      },
    }),
  ],
});
