/**
 * Client-side SEO helper (SPA fallback).
 *
 * Crawlers get per-route <head> from the server middleware (api/lib/seo.ts);
 * this module keeps document.title + the key meta tags correct as the user
 * navigates client-side, so shares/history entries stay accurate after the
 * first load.
 */

const SITE = "SAFI SPORT";
const DEFAULT_TITLE = "SAFI SPORT — Sportswear, Tripoli";
const DEFAULT_DESCRIPTION =
  "Adult & kids sportswear, shoes, training kits, jackets and hoodies. Two branches in Tripoli (El Mina · Dam w Farez), cash on delivery across Lebanon.";

function upsertMeta(selector, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement("meta");
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    document.head.appendChild(el);
  }
  return el;
}

function setContent(selector, attrs, content) {
  upsertMeta(selector, attrs).setAttribute("content", content);
}

function setCanonical(href) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

/**
 * @param {{ title?: string; description?: string; path?: string; image?: string; type?: string }} opts
 */
export function setPageMeta({ title, description, path, image, type } = {}) {
  if (typeof document === "undefined") return;
  const fullTitle = title ? `${title} — ${SITE}` : DEFAULT_TITLE;
  const desc = description || DEFAULT_DESCRIPTION;
  document.title = fullTitle;
  setContent('meta[name="description"]', { name: "description" }, desc);
  setContent('meta[property="og:title"]', { property: "og:title" }, fullTitle);
  setContent('meta[property="og:description"]', { property: "og:description" }, desc);
  setContent('meta[property="og:type"]', { property: "og:type" }, type || "website");
  if (image) setContent('meta[property="og:image"]', { property: "og:image" }, image);
  if (path) {
    const url = `${window.location.origin}${path}`;
    setContent('meta[property="og:url"]', { property: "og:url" }, url);
    setCanonical(url);
  }
}
