/**
 * Resolve the real client IP for rate limiting and abuse controls.
 *
 * Priority:
 *  1. `cf-connecting-ip` — set by Cloudflare when traffic rides it; not
 *     client-spoofable through the CDN.
 *  2. The RIGHTMOST `x-forwarded-for` entry. Under single-proxy append
 *     semantics (Railway's ingress appends the connecting IP to whatever
 *     the client sent), the LAST entry is the one the proxy added — the
 *     real connecting client. The LEFTMOST entry is whatever the client
 *     claimed, so reading [0] lets an attacker rotate fake XFF values to
 *     dodge per-IP rate limits.
 *  3. The node socket's remote address (from @hono/node-server's
 *     HttpBindings) when the caller has access to the Hono context.
 *  4. "local" as a last resort (direct fetch-adapter calls with no proxy
 *     headers — e.g. the tRPC context, which only sees the Request).
 */
export function clientIpFromHeaders(headers: Headers, remoteAddress?: string | null): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
    const rightmost = parts[parts.length - 1];
    if (rightmost) return rightmost;
  }

  return remoteAddress?.trim() || "local";
}
