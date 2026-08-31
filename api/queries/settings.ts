import { getDb } from "./connection";
import { auditLogs, siteSettings } from "@db/schema";
import { eq } from "drizzle-orm";
import { env } from "../lib/env";

/**
 * site_settings is a plain key/value store. Known keys (SPEC §2):
 *   pixel.enabled           (boolean, default true)
 *   pixel.consentRequired   (boolean, default false = track unless declined)
 *   delivery.feeCents       (number, default SAFI_DELIVERY_FEE_CENTS)
 *   store.whatsapp          (string)
 *   store.instagram         (string)
 *   branch.hours            (string)
 *   seo.*                   (free-form SEO strings)
 * Everything is JSON; absent keys fall back to the defaults below.
 */
export const SETTINGS_DEFAULTS = {
  "pixel.enabled": true,
  "pixel.consentRequired": false,
  "delivery.feeCents": env.deliveryFeeCents,
  "store.whatsapp": "+96181498942",
  "store.instagram": "",
  "branch.hours": "Mon–Sat 10:00–21:00, Sun 12:00–20:00",
  "seo.title": "SAFI SPORT — Sportswear in Tripoli",
  "seo.description": "Adult & kids sportswear, shoes and training gear. Two branches in Tripoli: El Mina and Dam w Farez. Cash on delivery across Lebanon.",
} as const;

export type SettingsKey = keyof typeof SETTINGS_DEFAULTS;
export type SettingsMap = { -readonly [K in SettingsKey]: (typeof SETTINGS_DEFAULTS)[K] };

export async function getSetting<K extends SettingsKey>(key: K): Promise<SettingsMap[K]> {
  const db = getDb();
  const [row] = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
  if (row?.value == null) return SETTINGS_DEFAULTS[key];
  return row.value as SettingsMap[K];
}

/** Reads all known settings keys, defaults filled in. */
export async function getSettings(): Promise<SettingsMap> {
  const db = getDb();
  const rows = await db.select().from(siteSettings);
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const out = {} as SettingsMap;
  for (const key of Object.keys(SETTINGS_DEFAULTS) as SettingsKey[]) {
    const v = byKey.get(key);
    out[key] = (v == null ? SETTINGS_DEFAULTS[key] : v) as never;
  }
  return out;
}

/** Owner-only settings write, audited. */
export async function setSetting<K extends SettingsKey>(
  key: K,
  value: SettingsMap[K],
  actorUserId: number,
): Promise<void> {
  const db = getDb();
  await db
    .insert(siteSettings)
    .values({ key, value: value as unknown as Record<string, unknown>, updatedAt: new Date() })
    .onDuplicateKeyUpdate({ set: { value: value as unknown as Record<string, unknown>, updatedAt: new Date() } });

  await db.insert(auditLogs).values({
    actorUserId,
    action: "settings.updated",
    entity: "site_setting",
    entityId: key,
    detail: { value },
  });
}

/** Flat delivery fee in cents (env default, owner-overridable). */
export async function getDeliveryFeeCents(): Promise<number> {
  return getSetting("delivery.feeCents");
}
