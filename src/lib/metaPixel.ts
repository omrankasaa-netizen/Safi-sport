// Meta Pixel + Conversions API integration for SAFI SPORT.
//
// Ported from Kharbesh src/lib/metaPixel.js — same architecture:
//   - Browser Pixel fires every core event (PageView on every page,
//     ViewContent, AddToCart, InitiateCheckout, Purchase, Contact) with a
//     unique event_id; the SAME event_id is posted to the server CAPI twin
//     (trpc meta.track / meta.purchase) so Meta deduplicates the pair.
//   - Advanced Matching: hashed (SHA-256) em/ph/fn/ln/ct/st/zp/country +
//     a persistent anonymous external_id are attached via fbq('init') and
//     forwarded (hashed only) to the CAPI twins for maximum Event Match
//     Quality. Raw PII is never stored and never sent to Meta unhashed.
//   - CONSENT: tracking is ON BY DEFAULT (implied consent — Lebanon/MENA is
//     not under GDPR's prior-opt-in mandate). Only an EXPLICIT "Decline" on
//     the consent banner stops it; the choice is remembered in localStorage.
//
// Everything is fail-safe: tracking must never throw into app code, and the
// whole module no-ops when VITE_SAFI_META_PIXEL_ID is unset.

import { api as server } from "./apiClient";

export const META_PIXEL_ID: string =
  (typeof import.meta !== "undefined" &&
    (import.meta.env?.VITE_SAFI_META_PIXEL_ID || import.meta.env?.VITE_META_PIXEL_ID)) ||
  "";

const CONSENT_KEY = "safi-consent"; // 'granted' | 'denied'
const VID_KEY = "_sf_vid";
const AM_KEY = "_sf_am";

let injected = false;

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

// ── Consent (implied opt-out) ────────────────────────────────────────────────

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getConsentChoice(): "granted" | "denied" | null {
  if (typeof window === "undefined") return null;
  const v = storage()?.getItem(CONSENT_KEY);
  return v === "granted" || v === "denied" ? v : null;
}

// TRUE by default — only an explicit decline blocks tracking.
export function hasMarketingConsent(): boolean {
  if (typeof window === "undefined") return false;
  return getConsentChoice() !== "denied";
}

// Whether the banner still needs to be shown (no decision recorded yet).
export function shouldAskConsent(): boolean {
  return !!META_PIXEL_ID && getConsentChoice() == null;
}

export function grantConsent() {
  storage()?.setItem(CONSENT_KEY, "granted");
  // Tracking already started under implied consent; just re-affirm Meta's
  // consent-mode flag. Do NOT re-fire PageView (would double-count).
  ensurePixel();
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq("consent", "grant");
  }
}

export function denyConsent() {
  storage()?.setItem(CONSENT_KEY, "denied");
  if (typeof window !== "undefined" && typeof window.fbq === "function") {
    window.fbq("consent", "revoke");
  }
}

// ── Identity (Advanced Matching) ─────────────────────────────────────────────

// SHA-256 via SubtleCrypto. Normalises (trim + lowercase) before hashing.
async function sha256hex(str?: string | null): Promise<string | undefined> {
  if (!str || typeof window === "undefined" || !window.crypto?.subtle) return undefined;
  try {
    const encoded = new TextEncoder().encode(String(str).trim().toLowerCase());
    const buf = await window.crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}

// Persistent anonymous visitor ID so Meta ties cross-session events together
// via external_id (consistent across Pixel + CAPI).
function getOrCreateVisitorId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let vid = storage()?.getItem(VID_KEY);
    if (!vid) {
      vid =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `vid-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      storage()?.setItem(VID_KEY, vid);
    }
    return vid;
  } catch {
    return null;
  }
}

// Capture ?fbclid=... into a _fbc cookie (millisecond creation time per Meta's
// spec) so both the Pixel and server CAPI read it for click attribution.
export function captureFbclid() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  try {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (!fbclid) return;
    const existing = document.cookie.split("; ").find((c) => c.startsWith("_fbc="));
    if (existing) {
      const val = decodeURIComponent(existing.split("=").slice(1).join("="));
      const ts = Number(val.split(".")[2]);
      if (val.startsWith("fb.1.") && ts > 1e12) return; // already valid (ms)
    }
    const fbc = `fb.1.${Date.now()}.${fbclid}`;
    document.cookie = `_fbc=${encodeURIComponent(fbc)};path=/;max-age=${90 * 24 * 60 * 60};SameSite=Lax`;
  } catch {
    /* never throw */
  }
}

export type HashedMatching = Record<string, string>;

// The persisted hashed identity blob (SHA-256 only — raw PII never touches
// storage or Meta). Feeds fbq('init') advanced matching AND the CAPI track
// twins so returning visitors earn EMQ credit from the very first event.
export function getStoredAdvancedMatching(): HashedMatching | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = storage()?.getItem(AM_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const clean: HashedMatching = {};
    for (const k of ["em", "ph", "fn", "ln", "ct", "st", "zp", "country", "external_id"]) {
      if (typeof parsed[k] === "string" && /^[0-9a-f]{64}$/.test(parsed[k])) clean[k] = parsed[k];
    }
    return Object.keys(clean).length ? clean : null;
  } catch {
    return null;
  }
}

// The persisted hashed external_id (SHA-256 of the anonymous visitor id).
// Sent with meta.purchase so the server-side CAPI Purchase carries the SAME
// external_id the Pixel events use (consistent cross-channel identity).
export function getStoredExternalIdHash(): string | undefined {
  return getStoredAdvancedMatching()?.external_id;
}

interface AdvancedMatchingInput {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

// Re-call fbq('init') with hashed Advanced Matching params (email, phone with
// country code, names, city/state/zip, country, external_id). Called with
// checkout contact data; {} on boot still attaches the anonymous external_id.
export async function updateAdvancedMatching({
  email,
  phone,
  firstName,
  lastName,
  city,
  state,
  zip,
  country,
}: AdvancedMatchingInput = {}) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  try {
    const vid = getOrCreateVisitorId();
    const normPhone = phone ? String(phone).replace(/[\s\-()]/g, "") : undefined;
    const [em, ph, fn, ln, ct, st, zp, ctr, extId] = await Promise.all([
      sha256hex(email),
      sha256hex(normPhone),
      sha256hex(firstName),
      sha256hex(lastName),
      sha256hex(city),
      sha256hex(state),
      sha256hex(zip),
      sha256hex(country ? String(country).trim().toLowerCase() : undefined),
      sha256hex(vid),
    ]);
    const userData: HashedMatching = {};
    if (em) userData.em = em;
    if (ph) userData.ph = ph;
    if (fn) userData.fn = fn;
    if (ln) userData.ln = ln;
    if (ct) userData.ct = ct;
    if (st) userData.st = st;
    if (zp) userData.zp = zp;
    if (ctr) userData.country = ctr;
    if (extId) userData.external_id = extId;
    if (Object.keys(userData).length === 0) return;
    window.fbq("init", META_PIXEL_ID, userData);
    // Persist the hashed identity (INCLUDING external_id — it is the SHA-256
    // of the random anonymous visitor id, never raw PII) for future sessions.
    storage()?.setItem(AM_KEY, JSON.stringify(userData));
  } catch {
    /* tracking must never break the UX */
  }
}

// ── Pixel bootstrap ──────────────────────────────────────────────────────────

function ensurePixel() {
  if (injected || typeof window === "undefined" || !META_PIXEL_ID) return;
  injected = true;
  /* eslint-disable */
  (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
  window.fbq!("consent", "grant");
  window.fbq!("init", META_PIXEL_ID);
  // Enrich with the anonymous external_id + any hashed identity persisted
  // from a previous session so every event earns EMQ from the first PageView.
  setTimeout(() => updateAdvancedMatching({}), 0);
  setTimeout(() => {
    try {
      const stored = getStoredAdvancedMatching();
      if (stored && typeof window.fbq === "function") window.fbq("init", META_PIXEL_ID, stored);
    } catch {
      /* never throw */
    }
  }, 0);
}

// Call once on app boot (from initAnalytics). Under implied consent this runs
// for every shopper who hasn't explicitly declined.
export function initMetaPixel() {
  if (!META_PIXEL_ID || !hasMarketingConsent()) return;
  captureFbclid();
  ensurePixel();
}

// ── Events ───────────────────────────────────────────────────────────────────

// Generate a UUID shared between a Pixel event and its CAPI twin for dedup.
export function genEventId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function ready(): boolean {
  return !!META_PIXEL_ID && typeof window !== "undefined" && !!window.fbq && hasMarketingConsent();
}

interface TrackParams {
  content_ids?: string[];
  contents?: { id: string; quantity: number; item_price: number }[];
  value?: number;
  currency?: string;
  num_items?: number;
  [key: string]: unknown;
}

// Server-side CAPI twin for a browser event, sent with the SAME event_id so
// Meta dedups the pair. Only non-PII params + the persisted HASHED identity
// are forwarded; the server derives ip/ua/fbp/fbc itself. Fire-and-forget.
function postCapiTrack(eventName: string, eventId: string, params: TrackParams = {}) {
  if (!hasMarketingConsent()) return;
  try {
    server.meta.track
      .mutate({
        event_name: eventName,
        event_id: eventId,
        event_source_url: typeof window !== "undefined" ? window.location?.href : undefined,
        user_data: getStoredAdvancedMatching() || undefined,
        content_ids: params.content_ids,
        contents: params.contents,
        value: params.value,
        currency: params.currency,
        num_items: params.num_items,
      })
      .catch(() => {
        /* tracking must never break the UX */
      });
  } catch {
    /* never throw into a handler */
  }
}

// Fire a Pixel event with a shared dedup event_id, then hand the same id to
// the server CAPI twin.
function trackDeduped(eventName: string, params: TrackParams = {}) {
  if (!ready()) return;
  const eventId = genEventId();
  window.fbq!("track", eventName, params, { eventID: eventId });
  postCapiTrack(eventName, eventId, params);
}

// PageView — every page, initial load + each client-side route change.
export function trackPageView() {
  if (!ready()) return;
  const eventId = genEventId();
  window.fbq!("track", "PageView", {}, { eventID: eventId });
  postCapiTrack("PageView", eventId);
}

interface ViewContentProduct {
  id: string | number;
  name?: string;
  nameEn?: string;
  priceCents?: number;
  price?: number;
}

// PDP view. content_ids:[productId], value, currency, content_name.
export function trackViewContent(product: ViewContentProduct | null | undefined) {
  if (!ready() || !product) return;
  const id = String(product.id ?? "").trim();
  if (!id) return;
  const price = Number(
    product.priceCents != null ? product.priceCents / 100 : (product.price ?? 0),
  );
  trackDeduped("ViewContent", {
    content_ids: [id],
    content_type: "product",
    content_name: product.nameEn || product.name,
    value: price,
    currency: "USD",
    contents: [{ id, quantity: 1, item_price: price }],
  });
}

export interface TrackCartItem {
  productId?: string | number;
  variantId?: number;
  productName?: string;
  name?: string;
  unitPrice?: number;
  priceCents?: number;
  quantity?: number;
}

// Add-to-cart. value is the line value (unit price × quantity).
export function trackAddToCart(item: TrackCartItem | null | undefined) {
  if (!ready() || !item) return;
  const id = String(item.variantId ?? item.productId ?? "").trim();
  if (!id) return;
  const unit = Number(item.unitPrice ?? (item.priceCents != null ? item.priceCents / 100 : 0));
  const quantity = Number(item.quantity || 1);
  trackDeduped("AddToCart", {
    content_ids: [id],
    content_type: "product",
    content_name: item.productName || item.name,
    value: unit * quantity,
    currency: "USD",
    contents: [{ id, quantity, item_price: unit }],
  });
}

// Checkout start. Aggregates all cart lines.
export function trackInitiateCheckout({
  items = [],
  value,
}: { items?: TrackCartItem[]; value?: number } = {}) {
  if (!ready() || !items.length) return;
  const contents = items
    .map((i) => {
      const id = String(i.variantId ?? i.productId ?? "").trim();
      return id
        ? { id, quantity: Number(i.quantity || 1), item_price: Number(i.unitPrice ?? 0) }
        : null;
    })
    .filter((c): c is { id: string; quantity: number; item_price: number } => !!c);
  trackDeduped("InitiateCheckout", {
    content_ids: contents.map((c) => c.id),
    content_type: "product",
    contents,
    value: Number(value ?? 0),
    currency: "USD",
    num_items: items.reduce((s, i) => s + (i.quantity || 0), 0),
  });
}

// Browser Purchase (Pixel side of the Pixel+CAPI pair). Pass the eventId the
// server will reuse so the two dedup.
export function trackPurchasePixel({
  eventId,
  value,
  currency = "USD",
  items = [],
}: {
  eventId?: string;
  value?: number;
  currency?: string;
  items?: TrackCartItem[];
}) {
  if (!ready() || !eventId) return;
  const contents = items
    .map((i) => {
      const id = String(i.variantId ?? i.productId ?? "").trim();
      return id
        ? { id, quantity: Number(i.quantity || 1), item_price: Number(i.unitPrice ?? 0) }
        : null;
    })
    .filter((c): c is { id: string; quantity: number; item_price: number } => !!c);
  window.fbq!(
    "track",
    "Purchase",
    {
      content_ids: contents.map((c) => c.id),
      content_type: "product",
      contents,
      value: Number(value ?? 0),
      currency: String(currency || "USD").trim().toUpperCase() || "USD",
      num_items: items.reduce((s, i) => s + (i.quantity || 0), 0),
    },
    { eventID: eventId },
  );
}

// Tell the backend to fire the server-side Purchase CAPI event for an order.
// The server reads the order (value, line items, hashed contact) from the DB
// — nothing money-related is trusted from the client. Best-effort.
export async function notifyPurchase({
  orderId,
  eventId,
}: {
  orderId?: number | string;
  eventId?: string;
}) {
  if (!orderId || !hasMarketingConsent()) return;
  try {
    await server.meta.purchase.mutate({
      order_id: Number(orderId),
      event_id: eventId || undefined,
      external_id: getStoredExternalIdHash() || undefined,
      event_source_url: typeof window !== "undefined" ? window.location?.href : undefined,
    });
  } catch {
    // Tracking must never break the order confirmation UX.
  }
}

// WhatsApp click — mapped to Meta's standard "Contact" event.
export function trackContact(context?: string) {
  if (!ready()) return;
  trackDeduped("Contact", context ? { content_name: context } : {});
}
