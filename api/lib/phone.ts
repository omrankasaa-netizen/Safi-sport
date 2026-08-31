/**
 * Server-side phone normalization, mirroring src/lib/phoneCountries.js
 * (the client-side picker helpers). The storefront now stores order phone
 * numbers as E.164; these helpers let order lookup/tracking accept either
 * an E.164 value or a raw "+961 70 123 456"-style paste and still match.
 */

export const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * Normalize a user-typed phone to E.164. Returns null when the input isn't
 * an international-format number (bare national numbers are returned
 * un-normalizable — the country code can't be guessed server-side).
 */
export function normalizePhoneToE164(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("00")) {
    digits = digits.slice(2);
  } else if (!trimmed.startsWith("+")) {
    return null;
  }
  digits = digits.replace(/^0+/, "");
  const e164 = `+${digits}`;
  return E164_REGEX.test(e164) ? e164 : null;
}

/**
 * All phone spellings a contact lookup should match: the raw input plus its
 * E.164 normalization when possible.
 */
export function phoneLookupVariants(contact: string): string[] {
  const variants = [contact.trim()];
  const normalized = normalizePhoneToE164(contact);
  if (normalized && !variants.includes(normalized)) variants.push(normalized);
  return variants;
}
