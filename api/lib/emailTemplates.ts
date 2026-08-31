import type { Order, OrderItem } from "@db/schema";
import { whatsappLink } from "@/lib/whatsapp";

/* Dark-theme email shell matching the SAFI SPORT palette (black #0A0A0C,
   panel #1B1C21, red #E1261C, ice #F4F5F7). Inline styles only — most email
   clients strip <style> blocks and ignore webfonts, so everything here uses
   safe system font stacks and table-based layout for maximum compatibility. */
const INK = "#0A0A0C";
const CARD = "#1B1C21";
const CREAM = "#F4F5F7";
const MUTED = "#9BA0AA";
const RED = "#E1261C";
const BORDER = "#26272D";

const LATIN_FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const ARABIC_FONT = "'Segoe UI', Tahoma, Arial, sans-serif";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function lineTotalCents(it: OrderItem): number {
  return it.unitPriceCents * it.qty;
}

function itemsTable(items: OrderItem[], lang: "en" | "ar"): string {
  const rows = items
    .map(
      (it) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid ${BORDER};color:${CREAM};font-family:${lang === "ar" ? ARABIC_FONT : LATIN_FONT};font-size:14px;">
          ${esc(it.productName)}<br/>
          <span style="color:${MUTED};font-size:12px;">${esc(it.color)} · ${esc(it.size)} · ×${it.qty}</span>
        </td>
        <td align="${lang === "ar" ? "left" : "right"}" style="padding:10px 0;border-bottom:1px solid ${BORDER};color:${CREAM};font-family:${LATIN_FONT};font-size:14px;white-space:nowrap;">
          $${(lineTotalCents(it) / 100).toFixed(2)}
        </td>
      </tr>`,
    )
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table>`;
}

function totalsRow(label: string, value: string, lang: "en" | "ar", strong = false): string {
  return `
    <tr>
      <td style="padding:4px 0;color:${strong ? CREAM : MUTED};font-family:${lang === "ar" ? ARABIC_FONT : LATIN_FONT};font-size:${strong ? 15 : 13}px;font-weight:${strong ? 700 : 400};">${esc(label)}</td>
      <td align="${lang === "ar" ? "left" : "right"}" style="padding:4px 0;color:${strong ? RED : MUTED};font-family:${LATIN_FONT};font-size:${strong ? 15 : 13}px;font-weight:${strong ? 700 : 400};">${esc(value)}</td>
    </tr>`;
}

/** Shared shell: black background, graphite card, red accent bar, footer with real contact details. */
function layout(params: { lang: "en" | "ar"; preheader: string; bodyHtml: string }): string {
  const { lang, preheader, bodyHtml } = params;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const font = lang === "ar" ? ARABIC_FONT : LATIN_FONT;
  const footerEn = `SAFI SPORT · Tripoli, Lebanon · +961 81 498 942`;
  const footerAr = `سافي سبورت · طرابلس، لبنان · ٩٦١ ٨١ ٤٩٨ ٩٤٢+`;

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>SAFI SPORT</title>
</head>
<body style="margin:0;padding:0;background:${INK};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:${INK};padding:32px 16px;">
  <tr>
    <td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;">
        <tr>
          <td style="padding:0 4px 20px;text-align:${lang === "ar" ? "right" : "left"};">
            <span style="font-family:${LATIN_FONT};font-weight:800;font-size:22px;letter-spacing:0.06em;color:${CREAM};text-transform:uppercase;">SAFI SPORT</span>
            <div style="width:36px;height:3px;background:${RED};margin-top:8px;${lang === "ar" ? "margin-right:auto;margin-left:0;" : ""}"></div>
          </td>
        </tr>
        <tr>
          <td style="background:${CARD};border:1px solid ${BORDER};border-radius:14px;padding:28px 26px;direction:${dir};text-align:${dir === "rtl" ? "right" : "left"};font-family:${font};">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 4px 0;text-align:center;">
            <p style="margin:0;color:${MUTED};font-size:11px;font-family:${LATIN_FONT};letter-spacing:0.02em;">
              ${lang === "ar" ? footerAr : footerEn}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function fulfilmentText(order: Order, lang: "en" | "ar"): string {
  if (order.fulfilment === "pickup") {
    return lang === "ar" ? "استلام من الفرع" : "Pickup at branch";
  }
  return lang === "ar" ? "توصيل" : "Delivery";
}

function addressText(order: Order): string {
  return [order.guestAddress, order.guestArea].filter(Boolean).join(", ");
}

export function orderConfirmationEmail(
  order: Order,
  items: OrderItem[],
  lang: "en" | "ar" = "en",
): { subject: string; html: string; text: string } {
  const wa = whatsappLink(
    "",
    lang === "ar"
      ? `مرحبا، معي طلب ${order.orderNumber} وحابب اتأكد من التفاصيل.`
      : `Hi, I have order ${order.orderNumber} and wanted to check on it.`,
  );
  const firstName = order.guestName.split(" ")[0];

  const bodyEn = `
    <p style="margin:0 0 4px;color:${MUTED};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-family:${LATIN_FONT};">Order received</p>
    <h1 style="margin:0 0 16px;color:${CREAM};font-size:24px;font-family:${LATIN_FONT};font-weight:800;">${esc(order.orderNumber)}</h1>
    <p style="margin:0 0 20px;color:${CREAM};font-size:14px;line-height:1.6;">
      Thanks, ${esc(firstName)} — we got it. Your order is now <strong style="color:${RED};">being prepared</strong>. We'll message you as it moves.
    </p>
    ${itemsTable(items, lang)}
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:16px;">
      ${totalsRow("Subtotal", money(order.subtotalCents), lang)}
      ${totalsRow(fulfilmentText(order, lang), order.fulfilment === "pickup" ? "Free" : money(order.deliveryFeeCents), lang)}
      ${totalsRow("Total", money(order.totalCents), lang, true)}
    </table>
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid ${BORDER};">
      <p style="margin:0 0 4px;color:${MUTED};font-size:12px;">${order.fulfilment === "pickup" ? "Pickup" : "Deliver to"}</p>
      <p style="margin:0;color:${CREAM};font-size:14px;line-height:1.5;">${esc(order.guestName)}<br/>${esc(addressText(order))}<br/>${esc(order.guestPhone)}</p>
      <p style="margin:12px 0 0;color:${MUTED};font-size:12px;">Payment: Cash on delivery</p>
    </div>
    <a href="${wa}" style="display:inline-block;margin-top:20px;background:${RED};color:#FFFFFF;font-weight:700;font-size:13px;padding:12px 20px;border-radius:8px;text-decoration:none;">Message us on WhatsApp</a>
  `;

  const bodyAr = `
    <p style="margin:0 0 4px;color:${MUTED};font-size:12px;font-family:${LATIN_FONT};letter-spacing:0.04em;">استلمنا طلبك</p>
    <h1 style="margin:0 0 16px;color:${CREAM};font-size:22px;font-family:${LATIN_FONT};font-weight:800;">${esc(order.orderNumber)}</h1>
    <p style="margin:0 0 20px;color:${CREAM};font-size:14px;line-height:1.8;">
      يسلمو، ${esc(firstName)} — الطلب وصلنا وصار <strong style="color:${RED};">قيد التحضير</strong>. رح نراسلك كل ما تحرّك.
    </p>
    ${itemsTable(items, lang)}
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:16px;">
      ${totalsRow("المجموع الفرعي", money(order.subtotalCents), lang)}
      ${totalsRow(fulfilmentText(order, lang), order.fulfilment === "pickup" ? "مجاني" : money(order.deliveryFeeCents), lang)}
      ${totalsRow("الإجمالي", money(order.totalCents), lang, true)}
    </table>
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid ${BORDER};">
      <p style="margin:0 0 4px;color:${MUTED};font-size:12px;">${order.fulfilment === "pickup" ? "استلام" : "عنوان التوصيل"}</p>
      <p style="margin:0;color:${CREAM};font-size:14px;line-height:1.6;">${esc(order.guestName)}<br/>${esc(addressText(order))}<br/>${esc(order.guestPhone)}</p>
      <p style="margin:12px 0 0;color:${MUTED};font-size:12px;">طريقة الدفع: الدفع عند الاستلام</p>
    </div>
    <a href="${wa}" style="display:inline-block;margin-top:20px;background:${RED};color:#FFFFFF;font-weight:700;font-size:13px;padding:12px 20px;border-radius:8px;text-decoration:none;">راسلنا عبر واتساب</a>
  `;

  const subject = lang === "ar" ? `استلمنا طلبك ${order.orderNumber} — سافي سبورت` : `Order ${order.orderNumber} received — SAFI SPORT`;
  const html = layout({
    lang,
    preheader: lang === "ar" ? "طلبك صار قيد التحضير." : "Your order is being prepared.",
    bodyHtml: lang === "ar" ? bodyAr : bodyEn,
  });
  const text =
    lang === "ar"
      ? `استلمنا طلبك ${order.orderNumber}. الإجمالي: ${money(order.totalCents)}.`
      : `Order ${order.orderNumber} received. Total: ${money(order.totalCents)}. ${fulfilmentText(order, "en")}: ${addressText(order)}.`;
  return { subject, html, text };
}

/** Internal staff notification fired to the ops inbox on every new order.
 * Always English — an operational tool for whoever is packing, not a
 * customer-facing message. Leads with what staff need to act: who, what,
 * where, and a direct link into the admin order list. */
export function adminNewOrderEmail(
  order: Order,
  items: OrderItem[],
): { subject: string; html: string; text: string } {
  const lang: "en" | "ar" = "en";
  const adminUrl = "https://safisport.com/admin/orders";
  const wa = whatsappLink(
    order.guestPhone,
    `Hi ${order.guestName.split(" ")[0]}, this is SAFI SPORT regarding your order ${order.orderNumber}.`,
  );

  const bodyHtml = `
    <p style="margin:0 0 4px;color:${MUTED};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">New order</p>
    <h1 style="margin:0 0 16px;color:${CREAM};font-size:24px;font-weight:800;">${esc(order.orderNumber)}</h1>
    ${itemsTable(items, lang)}
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:16px;">
      ${totalsRow("Subtotal", money(order.subtotalCents), lang)}
      ${totalsRow(fulfilmentText(order, lang), order.fulfilment === "pickup" ? "Free" : money(order.deliveryFeeCents), lang)}
      ${totalsRow("Total", money(order.totalCents), lang, true)}
    </table>
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid ${BORDER};">
      <p style="margin:0 0 4px;color:${MUTED};font-size:12px;">Customer</p>
      <p style="margin:0;color:${CREAM};font-size:14px;line-height:1.5;">${esc(order.guestName)}<br/>${esc(order.guestPhone)}<br/>${esc(addressText(order))}</p>
      <p style="margin:12px 0 0;color:${MUTED};font-size:12px;">Fulfilment: ${fulfilmentText(order, lang)} · Payment: Cash on delivery</p>
      ${order.needsTransfer ? `<p style="margin:12px 0 0;color:${RED};font-size:12px;">Needs a branch transfer before fulfilment.</p>` : ""}
    </div>
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px;"><tr>
      <td><a href="${adminUrl}" style="display:inline-block;background:${RED};color:#FFFFFF;font-weight:700;font-size:13px;padding:12px 20px;border-radius:8px;text-decoration:none;">Open in admin</a></td>
      <td style="width:10px;"></td>
      <td><a href="${wa}" style="display:inline-block;background:transparent;border:1px solid ${BORDER};color:${CREAM};font-weight:700;font-size:13px;padding:11px 20px;border-radius:8px;text-decoration:none;">Message customer</a></td>
    </tr></table>
  `;

  const subject = `New order ${order.orderNumber} — ${money(order.totalCents)}`;
  const html = layout({
    lang,
    preheader: `${esc(order.guestName)} just ordered · ${money(order.totalCents)}`,
    bodyHtml,
  });
  const text = `New order ${order.orderNumber} from ${order.guestName} (${order.guestPhone}). Total: ${money(order.totalCents)}. ${fulfilmentText(order, lang)}: ${addressText(order)}. Admin: ${adminUrl}`;
  return { subject, html, text };
}

/** Low-stock alert to the ops inbox, fired only when availability CROSSES
 *  the threshold (edge-triggered, once per drop) so it stays meaningful. */
export function lowStockAlertEmail(
  variants: { productName: string; color: string; size: string; branchName: string; available: number; lowStockThreshold: number }[],
): { subject: string; html: string; text: string } {
  const lang: "en" | "ar" = "en";
  const adminUrl = "https://safisport.com/admin/inventory";

  const rows = variants
    .map(
      (v) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid ${BORDER};color:${CREAM};font-size:13px;font-family:${LATIN_FONT};">
          ${esc(v.productName)} — ${esc(v.color)} · ${esc(v.size)} <span style="color:${MUTED};">(${esc(v.branchName)})</span>
        </td>
        <td align="right" style="padding:8px 0 8px 16px;border-bottom:1px solid ${BORDER};color:${RED};font-size:13px;font-family:${LATIN_FONT};white-space:nowrap;">
          ${v.available} left (alert at ${v.lowStockThreshold})
        </td>
      </tr>`,
    )
    .join("");

  const bodyHtml = `
    <p style="margin:0 0 4px;color:${MUTED};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Low stock · تنبيه مخزون</p>
    <h1 style="margin:0 0 16px;color:${CREAM};font-size:22px;font-weight:800;">Time to restock · وقت تجديد المخزون</h1>
    <p style="margin:0 0 16px;color:${CREAM};font-size:14px;line-height:1.6;">
      ${variants.length} variant${variants.length === 1 ? "" : "s"} dropped to (or below) the low-stock threshold.
      <span style="color:${MUTED};">في قطع قلّت — لازم نجدّد المخزون.</span>
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">${rows}</table>
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin-top:20px;"><tr>
      <td><a href="${adminUrl}" style="display:inline-block;background:${RED};color:#FFFFFF;font-weight:700;font-size:13px;padding:12px 20px;border-radius:8px;text-decoration:none;">Open inventory</a></td>
    </tr></table>
  `;

  const subject = "تنبيه مخزون — Low stock at SAFI SPORT";
  const html = layout({
    lang,
    preheader: `${variants.length} variant(s) low — time to restock.`,
    bodyHtml,
  });
  const text = [
    `Low stock — time to restock. ${variants.length} variant(s) at or below threshold:`,
    ...variants.map((v) => `- ${v.productName} ${v.color} ${v.size} (${v.branchName}): ${v.available} left (alert at ${v.lowStockThreshold})`),
    `Admin: ${adminUrl}`,
  ].join("\n");
  return { subject, html, text };
}

export function otpEmail(code: string, lang: "en" | "ar"): { subject: string; html: string; text: string } {
  const digits = code.split("");
  const chips = digits
    .map(
      (d) =>
        `<td style="padding:0 4px;"><div style="width:38px;height:46px;line-height:46px;text-align:center;background:${INK};border:1px solid ${BORDER};border-radius:8px;color:${RED};font-size:22px;font-weight:800;font-family:${LATIN_FONT};">${esc(d)}</div></td>`,
    )
    .join("");

  const bodyEn = `
    <p style="margin:0 0 4px;color:${MUTED};font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Sign-in code</p>
    <h1 style="margin:0 0 16px;color:${CREAM};font-size:22px;font-weight:800;">Here's your code</h1>
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 18px;"><tr>${chips}</tr></table>
    <p style="margin:0 0 8px;color:${CREAM};font-size:14px;line-height:1.6;">Enter this on the SAFI SPORT admin to sign in. It expires in <strong style="color:${RED};">10 minutes</strong>.</p>
    <p style="margin:0;color:${MUTED};font-size:12px;">Didn't request this? Just ignore it — no account changes without this code.</p>
  `;
  const bodyAr = `
    <p style="margin:0 0 4px;color:${MUTED};font-size:12px;font-family:${LATIN_FONT};letter-spacing:0.04em;">رمز الدخول</p>
    <h1 style="margin:0 0 16px;color:${CREAM};font-size:20px;font-weight:800;">هويّ الرمز</h1>
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 18px;"><tr>${chips}</tr></table>
    <p style="margin:0 0 8px;color:${CREAM};font-size:14px;line-height:1.8;">دخّل هالرمز على لوحة تحكم سافي سبورت. بينتهي بعد <strong style="color:${RED};">10 دقايق</strong>.</p>
    <p style="margin:0;color:${MUTED};font-size:12px;">ما طلبت هالرمز؟ تجاهله، ما في أي تغيير من دونه.</p>
  `;

  const subject = lang === "ar" ? `رمز الدخول: ${code} — سافي سبورت` : `Your SAFI SPORT sign-in code: ${code}`;
  const html = layout({
    lang,
    preheader: lang === "ar" ? "رمز دخولك جوا." : "Your sign-in code is inside.",
    bodyHtml: lang === "ar" ? bodyAr : bodyEn,
  });
  const text = lang === "ar" ? `رمز الدخول: ${code} (ينتهي بعد 10 دقايق)` : `Your sign-in code: ${code} (expires in 10 minutes)`;
  return { subject, html, text };
}
