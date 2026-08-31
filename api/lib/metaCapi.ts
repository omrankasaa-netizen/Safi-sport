// Meta Conversions API (server-side) helpers for Kharbesh.
//
// Implements Meta's recommended redundant setup: browser Pixel + server CAPI
// for every core event, deduplicated by a shared unique event_id, with
// maximum Event Match Quality:
//   - em/ph/fn/ln/ct/st/zp/country/external_id are SHA-256 hashed server-side
//     after normalization (emails lowercase, phones E.164 digits, names and
//     geo lowercased with punctuation stripped). Raw PII never leaves the
//     server unhashed.
//   - client_ip_address + client_user_agent + fbp/fbc are sent UNHASHED,
//     exactly as Meta expects, and are always derived from the request —
//     never trusted from the client body.
//   - event_time is a correct Unix timestamp (seconds), clamped into Meta's
//     accepted window (not >7 days old, not >60s in the future).
//
// Everything is env-driven (SAFI_META_PIXEL_ID / SAFI_META_CAPI_ACCESS_TOKEN
// / SAFI_META_TEST_EVENT_CODE) and degrades to a safe no-op when the token
// is unset, so the site runs with zero Meta config. All payload builders are
// pure and unit-tested; sendCapiEvent never throws and never logs PII/token.

import crypto from "node:crypto";
import { normalizePhoneToE164 } from "./phone";

// Pin a stable, recent Graph API version.
export const GRAPH_VERSION = "v21.0";

// Meta's accepted event_time window.
const SEVEN_DAYS_SEC = 7 * 24 * 60 * 60;

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function normalizeEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

// E.164 digits (no '+'). Store phones are already normalized to E.164 at
// checkout; fall back to the Lebanese default for legacy/free-text numbers.
export function normalizePhone(phone: unknown): string {
  const raw = String(phone ?? "").trim();
  if (!raw) return "";
  const e164 = normalizePhoneToE164(raw);
  if (e164) return e164.replace(/^\+/, "");
  let digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("961")) return digits;
  digits = digits.replace(/^0+/, "");
  if (!digits) return "";
  if (digits.length <= 8) digits = `961${digits}`;
  return digits;
}

// Free-text PII per Meta's spec before hashing: lowercase, trim, strip all
// punctuation/whitespace runs (names, city, state, zip).
export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

// Meta wants ISO 3166-1 alpha-2 for `country`. The checkout stores free text
// (usually "Lebanon"), so map the common spellings; anything already 2-letter
// passes through.
const COUNTRY_MAP: Record<string, string> = {
  lebanon: "lb",
  lubnan: "lb",
  لبنان: "lb",
};

export function normalizeCountry(value: unknown): string {
  const text = normalizeText(value);
  if (!text) return "";
  if (COUNTRY_MAP[text]) return COUNTRY_MAP[text];
  return /^[a-z]{2}$/.test(text) ? text : text; // pass through; Meta validates
}

function hashOrUndefined(normalized: string): string | undefined {
  return normalized ? sha256(normalized) : undefined;
}

export type MetaSignals = {
  clientIp?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
};

// fbc must be fb.1.{creationTime_ms}.{fbclid}; malformed values (e.g. a
// seconds-era creation time) hurt attribution, so drop them.
export function validFbc(fbc: unknown): string | undefined {
  const v = String(fbc ?? "");
  return /^fb\.1\.\d{13,}\..+/.test(v) ? v : undefined;
}

export type MetaUserDataInput = {
  email?: unknown;
  phone?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
  country?: unknown;
  externalId?: unknown; // already-hashed (64-hex) or raw id to hash
  externalIdPreHashed?: boolean;
};

// Build Meta `user_data`: identity fields SHA-256 hashed after normalization
// (single-element arrays, Meta's multi-match format); ip/ua/fbp/fbc raw.
export function buildUserData(
  input: MetaUserDataInput = {},
  signals: MetaSignals = {},
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  const em = hashOrUndefined(normalizeEmail(input.email));
  const ph = hashOrUndefined(normalizePhone(input.phone));
  const fn = hashOrUndefined(normalizeText(input.firstName));
  const ln = hashOrUndefined(normalizeText(input.lastName));
  const ct = hashOrUndefined(normalizeText(input.city));
  const st = hashOrUndefined(normalizeText(input.state));
  const zp = hashOrUndefined(normalizeText(input.zip));
  const ctr = hashOrUndefined(normalizeCountry(input.country));
  if (em) data.em = [em];
  if (ph) data.ph = [ph];
  if (fn) data.fn = [fn];
  if (ln) data.ln = [ln];
  if (ct) data.ct = [ct];
  if (st) data.st = [st];
  if (zp) data.zp = [zp];
  if (ctr) data.country = [ctr];

  // Consistent external_id across Pixel + CAPI (Meta recommendation).
  const rawExt = String(input.externalId ?? "").trim();
  if (rawExt) {
    const ext = input.externalIdPreHashed && /^[0-9a-f]{64}$/.test(rawExt)
      ? rawExt
      : sha256(rawExt.toLowerCase());
    data.external_id = [ext];
  }

  if (signals.clientIp) data.client_ip_address = signals.clientIp;
  if (signals.userAgent) data.client_user_agent = signals.userAgent;
  if (signals.fbp) data.fbp = signals.fbp;
  const fbc = validFbc(signals.fbc);
  if (fbc) data.fbc = fbc;
  return data;
}

// Merge CLIENT-PRE-HASHED identity fields into a server-built user_data object
// (used by the track endpoint). The browser only ever sends SHA-256 hashes it
// persisted from a previous checkout — raw PII is never accepted. Only
// well-formed 64-char lowercase-hex values under an allowlist are merged.
const CLIENT_HASHED_KEYS = ["em", "ph", "fn", "ln", "ct", "st", "zp", "country", "external_id"] as const;

export function mergeClientHashedUserData(
  userData: Record<string, unknown>,
  clientHashed: unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(userData || {}) };
  if (!clientHashed || typeof clientHashed !== "object") return out;
  const src = clientHashed as Record<string, unknown>;
  for (const k of CLIENT_HASHED_KEYS) {
    const v = src[k];
    if (typeof v === "string" && /^[0-9a-f]{64}$/.test(v) && !out[k]) out[k] = [v];
  }
  return out;
}

// ─── Events ─────────────────────────────────────────────────────────────────

// Events the track endpoint forwards to CAPI. Purchase is deliberately NOT in
// this allowlist: it fires only from the trusted server order flow so a
// spoofed client body can never mint a Purchase conversion. PageView carries
// no client-supplied custom_data, so a spoofed PageView is harmless.
export const TRACK_EVENTS = new Set(["PageView", "ViewContent", "AddToCart", "InitiateCheckout"]);

export function isTrackEvent(name: unknown): name is string {
  return typeof name === "string" && TRACK_EVENTS.has(name);
}

function normId(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v || null;
}

// Sanitize client-sent `contents` → [{ id, quantity, item_price? }]; drops
// id-less lines so Meta never receives an undefined content id.
export function sanitizeContents(contents: unknown): Array<{ id: string; quantity: number; item_price?: number }> {
  const out: Array<{ id: string; quantity: number; item_price?: number }> = [];
  for (const c of Array.isArray(contents) ? contents : []) {
    const id = normId((c as { id?: unknown })?.id);
    if (!id) continue;
    const quantity = Number((c as { quantity?: unknown })?.quantity) || 1;
    const price = Number((c as { item_price?: unknown })?.item_price);
    out.push({ id, quantity, ...(Number.isFinite(price) ? { item_price: price } : {}) });
  }
  return out;
}

// Build CAPI `custom_data` from client-sent NON-PII fields.
export function buildTrackCustomData(input: {
  contents?: unknown;
  content_ids?: unknown;
  value?: unknown;
  currency?: unknown;
  num_items?: unknown;
} = {}): Record<string, unknown> {
  const contents = sanitizeContents(input.contents);
  let contentIds = contents.map((c) => c.id);
  if (!contentIds.length && Array.isArray(input.content_ids)) {
    contentIds = input.content_ids.map(normId).filter((v): v is string => !!v);
  }
  const custom: Record<string, unknown> = {};
  if (contentIds.length) {
    custom.content_type = "product";
    custom.content_ids = contentIds;
  }
  if (contents.length) custom.contents = contents;
  const value = Number(input.value);
  if (Number.isFinite(value)) {
    custom.value = value;
    const cur = String(input.currency ?? "USD").trim().toUpperCase();
    custom.currency = cur || "USD";
  }
  const numItems = Number(input.num_items);
  if (Number.isFinite(numItems) && numItems > 0) custom.num_items = numItems;
  return custom;
}

// A single CAPI event envelope. Undefined optional fields are dropped.
export function buildEventPayload({
  eventName,
  eventId,
  eventTime,
  eventSourceUrl,
  actionSource = "website",
  userData = {},
  customData = {},
}: {
  eventName: string;
  eventId?: string;
  eventTime?: number;
  eventSourceUrl?: string;
  actionSource?: string;
  userData?: Record<string, unknown>;
  customData?: Record<string, unknown>;
}): Record<string, unknown> {
  const event: Record<string, unknown> = {
    event_name: eventName,
    event_time: eventTime || Math.floor(Date.now() / 1000),
    action_source: actionSource,
    user_data: userData,
    custom_data: customData,
  };
  if (eventId) event.event_id = eventId;
  if (eventSourceUrl) event.event_source_url = eventSourceUrl;
  return event;
}

// Clamp an event_time into Meta's accepted window (>7 days old or >60s in the
// future is rejected). Falls back to now for unparseable input.
export function clampEventTime(isoDate: unknown, nowSec = Math.floor(Date.now() / 1000)): number {
  let t = nowSec;
  if (isoDate) {
    const parsed = Math.floor(Date.parse(String(isoDate)) / 1000);
    if (Number.isFinite(parsed)) t = parsed;
  }
  if (t < nowSec - SEVEN_DAYS_SEC || t > nowSec + 60) return nowSec;
  return t;
}

// ─── Send ───────────────────────────────────────────────────────────────────

export type CapiSendResult = { ok: boolean; skipped?: string; status?: number; error?: unknown };

// POST a single event to the Graph API. Never rejects — tracking must never
// break the caller. Skips (no-op) when the access token is not configured so
// dev/tests require no secret. Never logs the token or any raw/hashed PII.
export async function sendCapiEvent({
  pixelId,
  accessToken,
  testEventCode,
  eventName,
  eventId,
  eventTime,
  eventSourceUrl,
  userData = {},
  customData = {},
}: {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
  eventName: string;
  eventId?: string;
  eventTime?: number;
  eventSourceUrl?: string;
  userData?: Record<string, unknown>;
  customData?: Record<string, unknown>;
}): Promise<CapiSendResult> {
  if (!pixelId || !accessToken) {
    return { ok: false, skipped: "not_configured" };
  }
  const event = buildEventPayload({ eventName, eventId, eventTime, eventSourceUrl, userData, customData });
  const body: Record<string, unknown> = { data: [event] };
  if (testEventCode) body.test_event_code = testEventCode;

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await resp.json().catch(() => ({}))) as { error?: { message?: string; fbtrace_id?: string } };
    if (!resp.ok) {
      console.error("[metaCapi] send failed", {
        event: eventName,
        status: resp.status,
        error: json?.error?.message,
        fbtrace_id: json?.error?.fbtrace_id,
      });
      return { ok: false, status: resp.status, error: json?.error };
    }
    return { ok: true, status: resp.status };
  } catch (e) {
    console.error("[metaCapi] send error", { event: eventName, message: (e as Error)?.message });
    return { ok: false, error: (e as Error)?.message };
  }
}
