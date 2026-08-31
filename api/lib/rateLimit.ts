/**
 * In-process fixed-window rate limiters, same bucket-map style as the
 * global API limiter in boot.ts. Single-instance deployments only — the
 * buckets live in process memory, so a multi-replica scale-out would need
 * a shared store (e.g. Redis) instead.
 */

type Bucket = { count: number; resetAt: number };

export function createFixedWindowLimiter({ windowMs, max }: { windowMs: number; max: number }) {
  const buckets = new Map<string, Bucket>();

  return {
    /**
     * Record one attempt for `key`. Returns true while under the limit,
     * false once `max` attempts have happened inside the current window.
     */
    check(key: string, now = Date.now()): boolean {
      const existing = buckets.get(key);
      const bucket = existing && existing.resetAt > now
        ? existing
        : { count: 0, resetAt: now + windowMs };
      bucket.count += 1;
      buckets.set(key, bucket);

      // Same eviction heuristic as boot.ts: only sweep when the map grows
      // past a bound, so steady-state traffic isn't paying an O(n) cleanup.
      if (buckets.size > 5000) {
        for (const [k, v] of buckets) {
          if (v.resetAt <= now) buckets.delete(k);
        }
      }

      return bucket.count <= max;
    },
  };
}

/**
 * Guest order lookups (orders.get / orders.track). 20 lookups per 10
 * minutes per IP — plenty for a real customer checking an order, far too
 * slow for enumerating serial order ids (audit H1).
 */
export const orderLookupLimiter = createFixedWindowLimiter({ windowMs: 10 * 60 * 1000, max: 20 });

/**
 * Order creation (orders.create). COD orders cost real money per fake order
 * (courier), so unauthenticated placement is throttled hard:
 * 5 orders per hour per IP (audit M6).
 */
export const orderCreateLimiter = createFixedWindowLimiter({ windowMs: 60 * 60 * 1000, max: 5 });

/**
 * Newsletter signup (newsletter.subscribe). Signups are idempotent
 * server-side, so a generous 10 per hour per IP is enough to stop scripted
 * list-stuffing without ever tripping a real shopper retrying a typo.
 */
export const newsletterLimiter = createFixedWindowLimiter({ windowMs: 60 * 60 * 1000, max: 10 });

// Meta CAPI endpoints: generous (every page view posts a track event) but
// bounded so a hostile client can't burn the Meta event quota.
export const metaTrackLimiter = createFixedWindowLimiter({ windowMs: 60 * 1000, max: 120 });
export const metaPurchaseLimiter = createFixedWindowLimiter({ windowMs: 10 * 60 * 1000, max: 20 });
