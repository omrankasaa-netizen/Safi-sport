// WhatsApp click-to-chat helpers. No API integration — just wa.me deep
// links, per the founder's confirmed decision (click-to-chat only, no
// WhatsApp Business API).

/**
 * Normalizes a Lebanese phone number into the digits-only, country-code
 * form wa.me expects (e.g. "96176465367"). Accepts local formats like
 * "03 465367", "3465367", "+961 3 465367", "76465367", etc.
 */
export function normalizeLebanesePhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00961')) digits = digits.slice(2); // 00961... -> 961...
  if (digits.startsWith('961')) return digits;
  // Local Lebanese numbers are written with a leading 0 (e.g. 03 465367,
  // 70 465367, 76 465367). Strip it and prefix the country code.
  if (digits.startsWith('0')) digits = digits.slice(1);
  return `961${digits}`;
}

/**
 * Builds a wa.me click-to-chat link with an optional prefilled message.
 * Falls back to the brand's support number when no phone is given.
 */
export function whatsappLink(phone, message) {
  const number = normalizeLebanesePhone(phone) || '96176465367';
  const base = `https://wa.me/${number}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}
