import { describe, expect, it } from "vitest";
import {
  buildEventPayload,
  buildTrackCustomData,
  buildUserData,
  clampEventTime,
  isTrackEvent,
  mergeClientHashedUserData,
  normalizeCountry,
  normalizeEmail,
  normalizePhone,
  sanitizeContents,
  sha256,
  validFbc,
} from "./lib/metaCapi";

/**
 * Unit tests for the Meta CAPI payload builders — normalization, hashing,
 * user_data assembly, the client-hashed merge allowlist, and event_time
 * clamping. Pure functions only; no network, no secrets.
 */

describe("normalization", () => {
  it("normalizes email per Meta spec (trim + lowercase)", () => {
    expect(normalizeEmail("  Omar@Kharbesh.com ")).toBe("omar@kharbesh.com");
    expect(normalizeEmail("")).toBe("");
    expect(normalizeEmail(null)).toBe("");
  });

  it("normalizes Lebanese phones to E.164 digits", () => {
    expect(normalizePhone("+961 71 123 456")).toBe("96171123456");
    expect(normalizePhone("71123456")).toBe("96171123456");
    expect(normalizePhone("03 123 456")).toBe("9613123456");
    expect(normalizePhone("")).toBe("");
  });

  it("maps free-text countries to ISO alpha-2", () => {
    expect(normalizeCountry("Lebanon")).toBe("lb");
    expect(normalizeCountry("لبنان")).toBe("lb");
    expect(normalizeCountry("US")).toBe("us");
  });
});

describe("buildUserData", () => {
  it("hashes identity fields and passes ip/ua/fbp/fbc raw", () => {
    const data = buildUserData(
      {
        email: "Omar@Kharbesh.com",
        phone: "+96171123456",
        firstName: "Omar",
        lastName: "Kassaa",
        city: "Beirut",
        country: "Lebanon",
      },
      { clientIp: "1.2.3.4", userAgent: "UA", fbp: "fb.1.123.abc", fbc: "fb.1.1700000000000.xyz" },
    );
    expect(data.em).toEqual([sha256("omar@kharbesh.com")]);
    expect(data.ph).toEqual([sha256("96171123456")]);
    expect(data.fn).toEqual([sha256("omar")]);
    expect(data.ln).toEqual([sha256("kassaa")]);
    expect(data.ct).toEqual([sha256("beirut")]);
    expect(data.country).toEqual([sha256("lb")]);
    expect(data.client_ip_address).toBe("1.2.3.4");
    expect(data.client_user_agent).toBe("UA");
    expect(data.fbp).toBe("fb.1.123.abc");
    expect(data.fbc).toBe("fb.1.1700000000000.xyz");
    // Raw PII must never appear anywhere in the payload.
    expect(JSON.stringify(data)).not.toContain("Omar@Kharbesh.com");
    expect(JSON.stringify(data)).not.toContain("+96171123456");
  });

  it("drops malformed fbc (seconds-era creation time)", () => {
    expect(validFbc("fb.1.1700000000.abc")).toBeUndefined();
    expect(validFbc("fb.1.1700000000000.abc")).toBe("fb.1.1700000000000.abc");
  });

  it("carries a consistent external_id (pre-hashed passes through, raw is hashed)", () => {
    const h = sha256("visitor-1");
    expect(buildUserData({ externalId: h, externalIdPreHashed: true }).external_id).toEqual([h]);
    expect(buildUserData({ externalId: "visitor-1" }).external_id).toEqual([sha256("visitor-1")]);
  });
});

describe("mergeClientHashedUserData", () => {
  it("merges only well-formed 64-hex values under the allowlist", () => {
    const base = { client_ip_address: "1.2.3.4" };
    const merged = mergeClientHashedUserData(base, {
      em: sha256("a@b.com"),
      external_id: sha256("vid"),
      role: sha256("admin"), // not allowlisted
      ph: "not-a-hash",
      fn: 123,
    });
    expect(merged.em).toEqual([sha256("a@b.com")]);
    expect(merged.external_id).toEqual([sha256("vid")]);
    expect(merged.role).toBeUndefined();
    expect(merged.ph).toBeUndefined();
    expect(merged.fn).toBeUndefined();
    expect(merged.client_ip_address).toBe("1.2.3.4");
  });

  it("never overwrites server-derived fields", () => {
    const base = { em: [sha256("server@x.com")] };
    const merged = mergeClientHashedUserData(base, { em: sha256("client@x.com") });
    expect(merged.em).toEqual([sha256("server@x.com")]);
  });
});

describe("track events", () => {
  it("allows PageView + commerce events, rejects Purchase and unknowns", () => {
    expect(isTrackEvent("PageView")).toBe(true);
    expect(isTrackEvent("ViewContent")).toBe(true);
    expect(isTrackEvent("AddToCart")).toBe(true);
    expect(isTrackEvent("InitiateCheckout")).toBe(true);
    expect(isTrackEvent("Purchase")).toBe(false);
    expect(isTrackEvent("")).toBe(false);
    expect(isTrackEvent(undefined)).toBe(false);
  });

  it("sanitizeContents drops id-less lines", () => {
    const out = sanitizeContents([
      { id: "tee-1", quantity: 2, item_price: 25 },
      { id: "", quantity: 1 },
      { quantity: 3 },
    ]);
    expect(out).toEqual([{ id: "tee-1", quantity: 2, item_price: 25 }]);
  });

  it("buildTrackCustomData carries value/currency and content ids", () => {
    const custom = buildTrackCustomData({
      contents: [{ id: "tee-1", quantity: 1, item_price: 25 }],
      value: 25,
      currency: "usd",
      num_items: 1,
    });
    expect(custom.content_ids).toEqual(["tee-1"]);
    expect(custom.currency).toBe("USD");
    expect(custom.value).toBe(25);
    expect(custom.num_items).toBe(1);
  });
});

describe("event envelope", () => {
  it("buildEventPayload includes event_id + unix event_time", () => {
    const ev = buildEventPayload({
      eventName: "PageView",
      eventId: "evt-1",
      eventTime: 1700000000,
      eventSourceUrl: "https://kharbesh961.com/shop",
    }) as Record<string, unknown>;
    expect(ev.event_name).toBe("PageView");
    expect(ev.event_id).toBe("evt-1");
    expect(ev.event_time).toBe(1700000000);
    expect(ev.action_source).toBe("website");
  });

  it("clampEventTime keeps in-window times, repairs out-of-window ones", () => {
    const now = 1_700_000_000;
    expect(clampEventTime(new Date((now - 3600) * 1000).toISOString(), now)).toBe(now - 3600);
    // 10 days ago → clamped to now
    expect(clampEventTime(new Date((now - 10 * 86400) * 1000).toISOString(), now)).toBe(now);
    // future → clamped to now
    expect(clampEventTime(new Date((now + 3600) * 1000).toISOString(), now)).toBe(now);
    expect(clampEventTime("garbage", now)).toBe(now);
    expect(clampEventTime(undefined, now)).toBe(now);
  });
});
