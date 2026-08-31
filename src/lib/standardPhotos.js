/**
 * The 4 "standard" front-of-shirt photos (chest logo only, no back design)
 * shot on each approved garment color. These are the default front photo
 * for every new product UNLESS a specific design also prints something on
 * the front — in that case staff simply replaces the pre-filled front image
 * in the per-color photo uploader with a custom shot.
 *
 * Keyed by `garment_colors.nameEn` exactly as seeded in the DB, so this map
 * stays in sync automatically if a color's hex changes.
 */
export const STANDARD_FRONT_BY_COLOR = {
  Black: '/assets/brand/standard-front-black.jpg',
  'Charcoal Blue': '/assets/brand/standard-front-charcoal-blue.jpg',
  White: '/assets/brand/standard-front-white.jpg',
  Grey: '/assets/brand/standard-front-grey.jpg',
};

// Sensible default for the top-level shop-grid cover photo on a brand new
// product, before staff has uploaded the real back design.
export const DEFAULT_COVER_FRONT = STANDARD_FRONT_BY_COLOR.Black;
