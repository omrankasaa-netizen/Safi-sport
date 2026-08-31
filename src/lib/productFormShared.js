/**
 * Shared constants for the product forms (full editor, quick add, bulk
 * import) — one source of truth so the three can't drift apart.
 */
export const PRODUCT_TYPES = ['tee', 'hoodie', 'accessory'];
export const PRODUCT_STATUSES = ['active', 'draft', 'archived'];
export const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
export const PREORDER_TYPES = ['always_on', 'open_until', 'quantity_target', 'limited_quantity'];

// Sensible starting price per garment type — staff can still override.
// Tees default to $35 per the brand's current pricing (Aug 2026).
export const DEFAULT_PRICE_BY_TYPE = { tee: 35, hoodie: 55, accessory: 20 };
