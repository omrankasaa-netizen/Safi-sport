import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "@db/schema";
import { authenticateRequest } from "./lib/session";
import { clientIpFromHeaders } from "./lib/clientIp";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
  /**
   * Real client IP resolved from proxy headers (see lib/clientIp.ts), for
   * the per-IP throttles on public endpoints (order lookup/creation,
   * loyalty preview, custom requests). The fetch adapter only hands us the
   * Request, so there's no socket fallback here — deployments must sit
   * behind the ingress that appends x-forwarded-for.
   */
  clientIp: string;
};

export async function createContext(
  opts: FetchCreateContextFnOptions,
): Promise<TrpcContext> {
  const ctx: TrpcContext = {
    req: opts.req,
    resHeaders: opts.resHeaders,
    clientIp: clientIpFromHeaders(opts.req.headers),
  };
  try {
    ctx.user = await authenticateRequest(opts.req.headers, opts.resHeaders);
  } catch {
    // Authentication is optional here
  }
  return ctx;
}
