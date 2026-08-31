/**
 * Catalog response normalizers.
 *
 * The storefront is coded against the SPEC §4 catalog.* procedure names
 * (list / bySlug / newArrivals / trending / related). These helpers tolerate
 * minor envelope drift ({items: [...]} vs [...]) so the UI keeps rendering
 * while the server implementation lands in parallel.
 *
 * Canonical card shape (what the UI consumes):
 *   { id, slug, name, audience, category, brand, priceCents,
 *     compareAtPriceCents, isNew, isTrending, image, inStock: {elmina, dam} }
 *
 * Canonical detail shape adds:
 *   description, sizeType, colors: [{ name, hex, images: string[] }],
 *   sizes: string[], variants: [{ id, sku, barcode, color, size,
 *   priceCents, stock: { elmina, dam } }]
 */

/** Accept `{items: [...]}`, `{products: [...]}` or a bare array. */
export function asList(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.products)) return data.products;
  return [];
}

function pickImage(p) {
  if (typeof p.image === 'string') return p.image;
  if (typeof p.imageUrl === 'string') return p.imageUrl;
  if (typeof p.coverImage === 'string') return p.coverImage;
  if (Array.isArray(p.images) && p.images.length) {
    const first = p.images[0];
    return typeof first === 'string' ? first : first?.url ?? first?.webpUrl ?? null;
  }
  if (Array.isArray(p.media) && p.media.length) {
    const first = p.media[0];
    return typeof first === 'string' ? first : first?.url ?? first?.webpUrl ?? null;
  }
  return null;
}

function pickBranchStock(p) {
  const src = p.inStock ?? p.stockByBranch ?? p.availability ?? null;
  const out = { elmina: 0, dam: 0 };
  if (src && typeof src === 'object' && !Array.isArray(src)) {
    out.elmina = Number(src.elmina ?? src.elMina ?? 0) || 0;
    out.dam = Number(src.dam ?? src.damwFarez ?? 0) || 0;
  } else if (Array.isArray(p.variants)) {
    for (const v of p.variants) {
      const s = v.stock ?? v.availability ?? {};
      out.elmina += Number(s.elmina ?? 0) || 0;
      out.dam += Number(s.dam ?? 0) || 0;
    }
  } else if (typeof p.totalStock === 'number') {
    out.elmina = p.totalStock;
  }
  return out;
}

export function normalizeCardProduct(p) {
  if (!p || typeof p !== 'object') return null;
  const priceCents = Number(p.priceCents ?? p.basePriceCents ?? 0) || 0;
  const compareAt = p.compareAtPriceCents != null ? Number(p.compareAtPriceCents) : null;
  return {
    id: p.id,
    slug: p.slug ?? String(p.id ?? ''),
    name: p.name ?? p.nameEn ?? 'Product',
    audience: p.audience ?? 'unisex',
    category: p.category ?? '',
    brand: p.brand ?? null,
    priceCents,
    compareAtPriceCents: Number.isFinite(compareAt) ? compareAt : null,
    isNew: !!p.isNew,
    isTrending: !!p.isTrending,
    image: pickImage(p),
    inStock: pickBranchStock(p),
  };
}

function normalizeImages(media) {
  if (!Array.isArray(media)) return [];
  return media
    .map((m) => (typeof m === 'string' ? m : m?.webpUrl ?? m?.url ?? null))
    .filter(Boolean);
}

/** Group variants → colors (with images) + ordered sizes. */
export function normalizeDetail(p) {
  if (!p || typeof p !== 'object') return null;
  const card = normalizeCardProduct(p);
  const variants = Array.isArray(p.variants) ? p.variants : [];

  // Colors may come as p.colors ([{name, hex, images}]) or derived from variants.
  let colors = [];
  if (Array.isArray(p.colors) && p.colors.length) {
    colors = p.colors.map((c) => ({
      name: c.name ?? c.color ?? '',
      hex: c.hex ?? c.colorHex ?? '#26272D',
      images: normalizeImages(c.images ?? c.media).length
        ? normalizeImages(c.images ?? c.media)
        : [],
    }));
  }
  const seen = new Set(colors.map((c) => c.name));
  for (const v of variants) {
    const name = v.color ?? 'Default';
    if (!seen.has(name)) {
      seen.add(name);
      colors.push({ name, hex: v.colorHex ?? '#26272D', images: [] });
    }
  }
  if (!colors.length) colors = [{ name: 'Default', hex: '#26272D', images: [] }];

  // Fill color images from mediaByColor / product-level media when missing.
  const mediaByColor = p.mediaByColor ?? p.imagesByColor ?? null;
  for (const c of colors) {
    if (c.images.length) continue;
    if (mediaByColor && typeof mediaByColor === 'object') {
      c.images = normalizeImages(mediaByColor[c.name]);
    }
  }
  const fallbackImages = normalizeImages(p.images ?? p.media);
  for (const c of colors) {
    if (!c.images.length) c.images = fallbackImages;
  }

  const sizes = Array.isArray(p.sizes) && p.sizes.length
    ? p.sizes
    : [...new Set(variants.map((v) => v.size).filter(Boolean))];

  return {
    ...card,
    description: p.description ?? p.descriptionEn ?? '',
    sizeType: p.sizeType ?? (p.category === 'shoes' ? 'shoe' : p.audience === 'kids' ? 'kids' : 'apparel'),
    colors,
    sizes,
    variants: variants.map((v) => ({
      id: v.id,
      sku: v.sku ?? '',
      barcode: v.barcode ?? '',
      color: v.color ?? colors[0].name,
      size: v.size ?? '',
      priceCents: Number(v.priceCents ?? v.priceOverrideCents ?? card.priceCents) || card.priceCents,
      stock: {
        elmina: Number(v.stock?.elmina ?? v.availability?.elmina ?? 0) || 0,
        dam: Number(v.stock?.dam ?? v.availability?.dam ?? 0) || 0,
      },
    })),
  };
}

/** Total stock across both branches for a color+size on a detail product. */
export function stockFor(variants, color, size) {
  const out = { elmina: 0, dam: 0 };
  for (const v of variants) {
    if (v.color === color && v.size === size) {
      out.elmina += v.stock.elmina;
      out.dam += v.stock.dam;
    }
  }
  return out;
}

/** The sellable variant for a color+size pick (first match). */
export function variantFor(variants, color, size) {
  return variants.find((v) => v.color === color && v.size === size) ?? null;
}
