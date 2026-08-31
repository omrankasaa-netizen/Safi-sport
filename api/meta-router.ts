import { z } from "zod";
import { eq } from "drizzle-orm";
import { orders } from "@db/schema";
import { createRouter, publicQuery } from "./middleware";
import { getDb } from "./queries/connection";
import { env } from "./lib/env";
import { metaTrackLimiter, metaPurchaseLimiter } from "./lib/rateLimit";
import {
  buildTrackCustomData,
  buildUserData,
  clampEventTime,
  isTrackEvent,
  mergeClientHashedUserData,
  sendCapiEvent,
} from "./lib/metaCapi";

// Meta Conversions API surface for SAFI SPORT.
//
// Two public endpoints, both fire-and-forget from the client's perspective
// and both safe when the CAPI token is unset (sendCapiEvent no-ops):
//
//   meta.track    — server-side twin of the browser Pixel's PageView /
//                   ViewContent / AddToCart / InitiateCheckout. The storefront
//                   posts the SAME event_id it passed to fbq so Meta dedups
//                   the pair. Only NON-PII custom_data + PRE-HASHED (SHA-256)
//                   identity fields are accepted; ip/ua/fbp/fbc are always
//                   derived from the request. Purchase is NOT accepted here.
//   meta.purchase — fires the server-side Purchase from TRUSTED order data:
//                   the client passes only an order id; every money/contact
//                   value is read from the database so the event can't be
//                   spoofed. Dedup comes from the deterministic event_id
//                   shared with the browser twin (purchase-<order_number> or
//                   the client-supplied id persisted at checkout).

const HASHED_64 = /^[0-9a-f]{64}$/;

const trackSchema = z.object({
  event_name: z.string().max(64),
  event_id: z.string().max(128).optional(),
  event_source_url: z.string().max(2000).optional(),
  user_data: z.record(z.string(), z.unknown()).optional(),
  contents: z.array(z.object({
    id: z.unknown().optional(),
    quantity: z.unknown().optional(),
    item_price: z.unknown().optional(),
  })).max(200).optional(),
  content_ids: z.array(z.unknown()).max(200).optional(),
  value: z.unknown().optional(),
  currency: z.unknown().optional(),
  num_items: z.unknown().optional(),
});

const purchaseSchema = z.object({
  order_id: z.coerce.number().int().positive(),
  // The browser-generated event_id persisted at checkout, so the CAPI event
  // dedups against the browser Purchase twin. Falls back to a deterministic
  // purchase-<order_number> id.
  event_id: z.string().max(128).optional(),
  // The browser's hashed (SHA-256) external_id — the anonymous visitor id it
  // already sends to the Pixel — so the CAPI Purchase carries the SAME
  // external_id and Meta stitches both channels to one profile.
  external_id: z.string().regex(HASHED_64).optional(),
  event_source_url: z.string().max(2000).optional(),
});

// Request-derived signals (never trusted from the client body).
function signalsFromCtx(ctx: { req: Request; clientIp: string }) {
  const headers = ctx.req.headers;
  const cookieHeader = headers.get("cookie") ?? "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((c) => {
      const idx = c.indexOf("=");
      return idx === -1
        ? [c.trim(), ""]
        : [c.slice(0, idx).trim(), decodeURIComponent(c.slice(idx + 1).trim())];
    }),
  );
  return {
    clientIp: ctx.clientIp,
    userAgent: headers.get("user-agent") ?? undefined,
    fbp: cookies._fbp || undefined,
    fbc: cookies._fbc || undefined,
  };
}

export const metaRouter = createRouter({
  track: publicQuery.input(trackSchema).mutation(async ({ ctx, input }) => {
    if (!metaTrackLimiter.check(ctx.clientIp)) return { ok: true as const };
    try {
      if (!isTrackEvent(input.event_name)) return { ok: false as const, error: "unsupported_event" };
      const customData = buildTrackCustomData(input);
      const userData = mergeClientHashedUserData(buildUserData({}, signalsFromCtx(ctx)), input.user_data);
      // Fire-and-forget: never block the caller on Meta, and always use
      // server time for browser-origin events (never a client timestamp).
      void sendCapiEvent({
        pixelId: env.metaPixelId,
        accessToken: env.metaCapiAccessToken,
        testEventCode: env.metaTestEventCode || undefined,
        eventName: input.event_name,
        eventId: input.event_id,
        eventTime: Math.floor(Date.now() / 1000),
        eventSourceUrl: input.event_source_url,
        userData,
        customData,
      }).catch((e) => console.error("[metaCapi] track send error:", (e as Error)?.message));
      return { ok: true as const };
    } catch (e) {
      console.error("[metaCapi] track route error:", (e as Error)?.message);
      return { ok: false as const };
    }
  }),

  purchase: publicQuery.input(purchaseSchema).mutation(async ({ ctx, input }) => {
    if (!metaPurchaseLimiter.check(ctx.clientIp)) return { ok: true as const };
    try {
      const order = await getDb().query.orders.findFirst({
        where: eq(orders.id, input.order_id),
        with: { items: true, customer: true },
      });
      if (!order) return { ok: false as const, error: "order_not_found" };

      const value = order.totalCents / 100;
      if (!Number.isFinite(value) || value <= 0) return { ok: true as const, skipped: "invalid_value" };

      const contents = order.items.map((i) => ({
        id: i.sku,
        quantity: i.qty,
        item_price: i.unitPriceCents / 100,
      }));

      const nameParts = String(order.guestName ?? "").trim().split(/\s+/);
      const userData = buildUserData(
        {
          email: order.customer?.email ?? undefined,
          phone: order.guestPhone,
          firstName: nameParts[0],
          lastName: nameParts.slice(1).join(" ") || undefined,
          city: order.guestArea ?? undefined,
          country: "Lebanon",
          // Prefer the browser's hashed visitor id; otherwise fall back to a
          // stable server-side id so the event still carries a consistent
          // cross-session identifier.
          externalId: input.external_id ?? order.guestPhone,
          externalIdPreHashed: !!input.external_id,
        },
        signalsFromCtx(ctx),
      );

      const result = await sendCapiEvent({
        pixelId: env.metaPixelId,
        accessToken: env.metaCapiAccessToken,
        testEventCode: env.metaTestEventCode || undefined,
        eventName: "Purchase",
        eventId: input.event_id || `purchase-${order.orderNumber}`,
        eventTime: clampEventTime(order.createdAt?.toISOString?.() ?? order.createdAt),
        eventSourceUrl: input.event_source_url,
        userData,
        customData: {
          currency: env.currency,
          value,
          content_type: "product",
          content_ids: contents.map((c) => c.id),
          contents,
          order_id: order.orderNumber,
          num_items: contents.reduce((s, c) => s + (c.quantity || 0), 0),
        },
      });
      return { ok: result.ok, skipped: result.skipped };
    } catch (e) {
      // Tracking must never surface as a checkout error.
      console.error("[metaCapi] purchase route error:", (e as Error)?.message);
      return { ok: false as const, error: "purchase_capi_failed" };
    }
  }),
});
