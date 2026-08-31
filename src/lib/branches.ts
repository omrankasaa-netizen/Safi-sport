/**
 * SAFI SPORT — branch + contact constants.
 *
 * These are the FALLBACK values used when the settings/branches tRPC data
 * hasn't loaded yet (or the request fails). The storefront prefers live
 * values from `settings.get` (store.whatsapp / store.instagram /
 * branch.hours) and falls back to these constants so the UI never renders
 * empty contact links.
 */

export type BranchCode = "elmina" | "dam";

export interface BranchInfo {
  code: BranchCode;
  name: string;
  area: string;
  address: string;
  phone: string;
  whatsapp: string; // wa.me digits
  hours: string;
  mapsUrl: string;
}

export const BRANCHES: Record<BranchCode, BranchInfo> = {
  elmina: {
    code: "elmina",
    name: "El Mina",
    area: "El Mina, Tripoli",
    address: "El Mina, Tripoli, Lebanon",
    phone: "+961 81 498 942",
    whatsapp: "96181498942",
    hours: "10:00 AM – 8:30 PM",
    mapsUrl: "https://maps.google.com/?q=SAFI+SPORT+El+Mina+Tripoli",
  },
  dam: {
    code: "dam",
    name: "Dam w Farez",
    area: "Dam w Farez, Tripoli",
    address: "Dam w Farez, Tripoli, Lebanon",
    phone: "+961 81 498 942",
    whatsapp: "96181498942",
    hours: "10:00 AM – 8:30 PM",
    mapsUrl: "https://maps.google.com/?q=SAFI+SPORT+Dam+w+Farez+Tripoli",
  },
};

export const BRANCH_LIST: BranchInfo[] = [BRANCHES.elmina, BRANCHES.dam];

/** Public business WhatsApp (wa.me digits, no +). From SAFI's Instagram bio. */
export const WHATSAPP = "96181498942";
export const INSTAGRAM = "https://www.instagram.com/safi.sport/";
export const INSTAGRAM_HANDLE = "@safi.sport";

/** WhatsApp deep link helper. */
export function waLink(message: string, number: string = WHATSAPP): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/** Normalise a settings.get() payload into the storefront's contact shape. */
export function resolveStoreContact(settings?: Record<string, unknown> | null) {
  const s = settings ?? {};
  const whatsappRaw = typeof s["store.whatsapp"] === "string" ? (s["store.whatsapp"] as string) : "";
  const whatsapp = whatsappRaw.replace(/[^\d]/g, "") || WHATSAPP;
  const instagram =
    typeof s["store.instagram"] === "string" && s["store.instagram"]
      ? (s["store.instagram"] as string)
      : INSTAGRAM;
  const hours =
    typeof s["branch.hours"] === "string" && s["branch.hours"]
      ? (s["branch.hours"] as string)
      : null;
  const deliveryFeeCents =
    typeof s["delivery.feeCents"] === "number" ? (s["delivery.feeCents"] as number) : 300000;
  return { whatsapp, instagram, hours, deliveryFeeCents };
}

/** Format integer cents as a storefront price ("$35"). */
export function formatPrice(cents: number | null | undefined): string {
  const n = typeof cents === "number" && Number.isFinite(cents) ? cents : 0;
  const dollars = n / 100;
  return `$${Number.isInteger(dollars) ? dollars : dollars.toFixed(2)}`;
}
