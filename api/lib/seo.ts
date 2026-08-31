/**
 * Server-side per-route SEO / social metadata for the SAFI SPA (ported from
 * aura's productMeta.js approach, SPEC §5).
 *
 * The storefront is a client-rendered React SPA. Crawlers (Google, Meta's
 * catalog scanner, WhatsApp link previews) do not reliably execute JS, so
 * the production server rewrites dist/public/index.html per route BEFORE the
 * SPA fallback:
 *
 *   /product/:slug → Product JSON-LD + product OG tags + canonical
 *   /              → LocalBusiness (both branches) + Organization JSON-LD
 *   everything     → canonical + title/description polish
 *
 * Plus GET /sitemap.xml and /robots.txt generated from the DB.
 *
 * Every DB access is fail-soft: if the database is unreachable the plain
 * index.html (with sensible defaults) is served instead.
 */

import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { asc, eq } from "drizzle-orm";
import { branches, mediaAssets, products } from "@db/schema";
import { getDb } from "../queries/connection";
import { getSettings } from "../queries/settings";

const SOCIAL_START = "<!-- SAFI_SOCIAL_META_START";
const SOCIAL_END = "SAFI_SOCIAL_META_END -->";

const FALLBACK_BRANCHES = [
  {
    code: "elmina",
    name: "SAFI SPORT — El Mina",
    address: "El Mina, Tripoli, Lebanon",
    phone: "+961 81 498 942",
  },
  {
    code: "dam",
    name: "SAFI SPORT — Dam w Farez",
    address: "Dam w Farez, Tripoli, Lebanon",
    phone: "+961 81 498 942",
  },
];

/** Public origin for canonical/OG URLs. Configure with SAFI_SITE_URL. */
export function publicBaseUrl(): string {
  const fromEnv = (process.env.SAFI_SITE_URL ?? "").trim().replace(/\/+$/, "");
  return fromEnv || "https://safi-sport.com";
}

function escapeAttr(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface MetaBlock {
  title: string;
  description: string;
  canonical: string;
  ogType?: string;
  ogImage?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

/** Replace the marker region (and <title>) in index.html with per-route meta. */
export function injectSeoMeta(template: string, meta: MetaBlock): string {
  const start = template.indexOf(SOCIAL_START);
  const end = template.indexOf(SOCIAL_END);
  let out = template;

  const lines = [
    `<link rel="canonical" href="${escapeAttr(meta.canonical)}" />`,
    `<meta property="og:title" content="${escapeAttr(meta.title)}" />`,
    `<meta property="og:description" content="${escapeAttr(meta.description)}" />`,
    `<meta property="og:type" content="${meta.ogType ?? "website"}" />`,
    `<meta property="og:url" content="${escapeAttr(meta.canonical)}" />`,
    `<meta name="description" content="${escapeAttr(meta.description)}" />`,
  ];
  if (meta.ogImage) {
    lines.push(`<meta property="og:image" content="${escapeAttr(meta.ogImage)}" />`);
  }
  if (meta.jsonLd) {
    const safeJson = JSON.stringify(meta.jsonLd).replace(/</g, "\\u003c");
    lines.push(`<script type="application/ld+json">${safeJson}</script>`);
  }
  const region = `<!-- SAFI_SOCIAL_META_START -->\n    ${lines.join("\n    ")}\n    <!-- SAFI_SOCIAL_META_END -->`;

  if (start !== -1 && end !== -1) {
    out = out.slice(0, start) + region + out.slice(end + SOCIAL_END.length);
  } else {
    const headEnd = out.lastIndexOf("</head>");
    if (headEnd !== -1) out = out.slice(0, headEnd) + region + out.slice(headEnd);
  }

  // Replace the default <title> with the route-specific one.
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(meta.title)}</title>`);
  return out;
}

async function loadBranches() {
  try {
    const rows = await getDb().select().from(branches).where(eq(branches.isActive, true));
    if (rows.length) {
      return rows.map((b) => ({
        code: b.code,
        name: `SAFI SPORT — ${b.nameEn}`,
        address: b.address,
        phone: b.phone ?? "+961 81 498 942",
      }));
    }
  } catch {
    /* fail-soft */
  }
  return FALLBACK_BRANCHES;
}

async function defaultMeta(pathname: string): Promise<MetaBlock> {
  let title = "SAFI SPORT — Sportswear, Tripoli";
  let description =
    "Adult & kids sportswear, shoes, training kits, jackets and hoodies. Two branches in Tripoli (El Mina · Dam w Farez), cash on delivery across Lebanon.";
  try {
    const settings = await getSettings();
    if (settings["seo.title"]) title = settings["seo.title"];
    if (settings["seo.description"]) description = settings["seo.description"];
  } catch {
    /* fail-soft */
  }
  const base = publicBaseUrl();
  const branchList = await loadBranches();
  const jsonLd: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "SAFI SPORT",
      url: base,
      sameAs: ["https://www.instagram.com/safi.sport/"],
    },
    {
      "@context": "https://schema.org",
      "@type": "SportingGoodsStore",
      name: "SAFI SPORT",
      url: base,
      description,
      currenciesAccepted: "USD",
      paymentAccepted: "Cash on delivery",
      address: { "@type": "PostalAddress", addressCountry: "LB", addressLocality: "Tripoli" },
      department: branchList.map((b) => ({
        "@type": "SportingGoodsStore",
        name: b.name,
        address: { "@type": "PostalAddress", streetAddress: b.address, addressCountry: "LB" },
        telephone: b.phone,
      })),
    },
  ];
  return { title, description, canonical: `${base}${pathname}`, jsonLd };
}

async function productMeta(slug: string): Promise<MetaBlock | null> {
  const base = publicBaseUrl();
  try {
    const db = getDb();
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.slug, slug))
      .limit(1);
    if (!product || product.status !== "active") return null;

    const images = await db
      .select({ url: mediaAssets.url, webpUrl: mediaAssets.webpUrl })
      .from(mediaAssets)
      .where(eq(mediaAssets.productId, product.id))
      .orderBy(asc(mediaAssets.sortOrder))
      .limit(5);
    const image = images[0]?.webpUrl ?? images[0]?.url;

    const title = product.metaTitle || `${product.nameEn} — SAFI SPORT`;
    const description =
      product.metaDescription ||
      product.descriptionEn?.slice(0, 160) ||
      `${product.nameEn} — ${product.audience} ${product.category} at SAFI SPORT, Tripoli. Cash on delivery across Lebanon.`;

    const jsonLd: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.nameEn,
      description,
      brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
      image: image ? [image.startsWith("http") ? image : `${base}${image}`] : undefined,
      offers: {
        "@type": "Offer",
        url: `${base}/product/${product.slug}`,
        priceCurrency: "USD",
        price: (product.basePriceCents / 100).toFixed(2),
        availability: "https://schema.org/InStock",
        itemCondition: "https://schema.org/NewCondition",
      },
    };
    return {
      title,
      description,
      canonical: `${base}/product/${product.slug}`,
      ogType: "product",
      ogImage: image ? (image.startsWith("http") ? image : `${base}${image}`) : undefined,
      jsonLd,
    };
  } catch {
    return null;
  }
}

/** Resolve the meta block for a path. Falls back to the default on any error. */
export async function metaForPath(pathname: string): Promise<MetaBlock> {
  try {
    const productMatch = pathname.match(/^\/product\/([A-Za-z0-9][A-Za-z0-9-]*)$/);
    if (productMatch) {
      const meta = await productMeta(productMatch[1]);
      if (meta) return meta;
    }
  } catch {
    /* fall through to default */
  }
  return defaultMeta(pathname);
}

/** Register /sitemap.xml and /robots.txt (from the DB, fail-soft). */
export function registerSeoRoutes<E extends { Bindings: unknown }>(
  app: Hono<E & { Bindings: import("@hono/node-server").HttpBindings }>,
) {
  app.get("/robots.txt", (c) => {
    const base = publicBaseUrl();
    return c.text(
      [
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin",
        "Disallow: /api",
        "",
        `Sitemap: ${base}/sitemap.xml`,
        "",
      ].join("\n"),
    );
  });

  app.get("/sitemap.xml", async (c) => {
    const base = publicBaseUrl();
    const staticPaths = ["/", "/shop", "/track"];
    let productUrls: string[] = [];
    try {
      const rows = await getDb()
        .select({ slug: products.slug, updatedAt: products.updatedAt })
        .from(products)
        .where(eq(products.status, "active"))
        .orderBy(asc(products.id))
        .limit(5000);
      productUrls = rows.map(
        (r) =>
          `  <url><loc>${base}/product/${escapeAttr(r.slug)}</loc>` +
          (r.updatedAt ? `<lastmod>${new Date(r.updatedAt).toISOString().slice(0, 10)}</lastmod>` : "") +
          "</url>",
      );
    } catch (e) {
      console.error("[seo] sitemap product query failed:", (e as Error)?.message);
    }
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      staticPaths.map((p) => `  <url><loc>${base}${p}</loc></url>`).join("\n") +
      (productUrls.length ? `\n${productUrls.join("\n")}` : "") +
      `\n</urlset>\n`;
    return c.text(xml, 200, { "Content-Type": "application/xml; charset=utf-8" });
  });
}
