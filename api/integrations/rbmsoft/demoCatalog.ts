import type { Audience, Category, SizeType } from "@contracts/constants";

/**
 * The single deterministic demo catalog, shared by db/seed.ts (initial rows)
 * and the RBMsoft mock driver (sync source of truth in dev). Keeping both
 * reading from THIS module is what makes mock sync coherent: every barcode
 * the mock "POS" reports exists as a seeded variant, and every seeded
 * variant reports mock stock.
 *
 * DEMO DATA — every product/variant below is demo seed data, clearly marked.
 */

export type DemoVariant = {
  sku: string;
  /** EAN-13-looking demo barcode (13 digits, deterministic). */
  barcode: string;
  color: string;
  colorHex: string | null;
  size: string;
  sizeType: SizeType;
  priceOverrideCents?: number;
};

export type DemoProduct = {
  slug: string;
  nameEn: string;
  nameAr?: string;
  descriptionEn: string;
  audience: Audience;
  category: Category;
  brand: string | null;
  basePriceCents: number;
  compareAtPriceCents?: number;
  isNew: boolean;
  isTrending: boolean;
  rbmsoftItemId: string;
  variants: DemoVariant[];
};

const SHOE_SIZES = ["40", "41", "42", "43", "44", "45"];
const APPAREL_SIZES = ["S", "M", "L", "XL"];
const KIDS_SIZES = ["4Y", "6Y", "8Y", "10Y", "12Y", "14Y"];

/** Deterministic EAN-13-looking demo barcode from a stable counter. */
let barcodeCounter = 0;
function demoBarcode(): string {
  barcodeCounter += 1;
  // "622" prefix (Lebanon GS1) + zero-padded counter + deterministic check-ish digit.
  const body = `622${String(barcodeCounter).padStart(9, "0")}`; // 12 digits
  const check = (10 - ([...body].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0) % 10)) % 10;
  return `${body}${check}`;
}

function mkVariants(
  skuBase: string,
  colors: { name: string; hex: string | null }[],
  sizes: string[],
  sizeType: SizeType,
): DemoVariant[] {
  const out: DemoVariant[] = [];
  for (const color of colors) {
    for (const size of sizes) {
      out.push({
        sku: `${skuBase}-${color.name.toUpperCase().replace(/\s+/g, "")}-${size}`,
        barcode: demoBarcode(),
        color: color.name,
        colorHex: color.hex,
        size,
        sizeType,
      });
    }
  }
  return out;
}

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    slug: "nike-air-zoom-pegasus",
    nameEn: "Nike Air Zoom Pegasus",
    descriptionEn: "Everyday road running shoe with responsive Zoom Air cushioning.",
    audience: "men",
    category: "shoes",
    brand: "Nike",
    basePriceCents: 12000,
    compareAtPriceCents: 14000,
    isNew: true,
    isTrending: true,
    rbmsoftItemId: "RBM-IT-0001",
    variants: mkVariants(
      "NK-PEG",
      [{ name: "Black", hex: "#111111" }, { name: "White", hex: "#F4F5F7" }],
      SHOE_SIZES,
      "shoe",
    ),
  },
  {
    slug: "adidas-ultraboost-light",
    nameEn: "adidas Ultraboost Light",
    descriptionEn: "Lightweight BOOST running shoe for daily miles.",
    audience: "women",
    category: "shoes",
    brand: "adidas",
    basePriceCents: 14000,
    isNew: true,
    isTrending: false,
    rbmsoftItemId: "RBM-IT-0002",
    variants: mkVariants("AD-UBL", [{ name: "Grey", hex: "#9BA0AA" }], SHOE_SIZES, "shoe"),
  },
  {
    slug: "safi-runner-jr",
    nameEn: "SAFI Runner Jr",
    descriptionEn: "Durable kids' running shoe for school and play.",
    audience: "kids",
    category: "shoes",
    brand: "SAFI",
    basePriceCents: 5500,
    isNew: false,
    isTrending: true,
    rbmsoftItemId: "RBM-IT-0003",
    variants: mkVariants(
      "SF-RJR",
      [{ name: "Red", hex: "#E1261C" }, { name: "Black", hex: "#111111" }],
      KIDS_SIZES,
      "kids",
    ),
  },
  {
    slug: "safi-essential-tee",
    nameEn: "SAFI Essential Tee",
    descriptionEn: "Soft cotton everyday tee with the SAFI chest mark.",
    audience: "unisex",
    category: "tees",
    brand: "SAFI",
    basePriceCents: 2500,
    isNew: false,
    isTrending: false,
    rbmsoftItemId: "RBM-IT-0004",
    variants: mkVariants(
      "SF-ETE",
      [{ name: "Black", hex: "#111111" }, { name: "White", hex: "#F4F5F7" }, { name: "Red", hex: "#E1261C" }],
      APPAREL_SIZES,
      "apparel",
    ),
  },
  {
    slug: "nike-dri-fit-training-top",
    nameEn: "Nike Dri-FIT Training Top",
    descriptionEn: "Sweat-wicking training top for the gym and pitch.",
    audience: "men",
    category: "training",
    brand: "Nike",
    basePriceCents: 3800,
    isNew: false,
    isTrending: true,
    rbmsoftItemId: "RBM-IT-0005",
    variants: mkVariants("NK-DFT", [{ name: "Black", hex: "#111111" }], APPAREL_SIZES, "apparel"),
  },
  {
    slug: "adidas-tiro-track-pants",
    nameEn: "adidas Tiro Track Pants",
    descriptionEn: "Classic slim track pants with ankle zips.",
    audience: "men",
    category: "pants",
    brand: "adidas",
    basePriceCents: 4500,
    isNew: false,
    isTrending: false,
    rbmsoftItemId: "RBM-IT-0006",
    variants: mkVariants("AD-TRO", [{ name: "Black", hex: "#111111" }], APPAREL_SIZES, "apparel"),
  },
  {
    slug: "safi-performance-shorts",
    nameEn: "SAFI Performance Shorts",
    descriptionEn: "Light quick-dry training shorts.",
    audience: "unisex",
    category: "shorts",
    brand: "SAFI",
    basePriceCents: 2200,
    isNew: true,
    isTrending: false,
    rbmsoftItemId: "RBM-IT-0007",
    variants: mkVariants(
      "SF-PSH",
      [{ name: "Black", hex: "#111111" }, { name: "Graphite", hex: "#26272D" }],
      APPAREL_SIZES,
      "apparel",
    ),
  },
  {
    slug: "nike-club-fleece-hoodie",
    nameEn: "Nike Club Fleece Hoodie",
    descriptionEn: "Brushed-back fleece hoodie, everyday warmth.",
    audience: "men",
    category: "hoodies",
    brand: "Nike",
    basePriceCents: 6500,
    compareAtPriceCents: 7500,
    isNew: false,
    isTrending: true,
    rbmsoftItemId: "RBM-IT-0008",
    variants: mkVariants(
      "NK-CFH",
      [{ name: "Grey", hex: "#9BA0AA" }, { name: "Black", hex: "#111111" }],
      APPAREL_SIZES,
      "apparel",
    ),
  },
  {
    slug: "safi-kids-hoodie",
    nameEn: "SAFI Kids Hoodie",
    descriptionEn: "Cozy fleece hoodie for the little athletes.",
    audience: "kids",
    category: "hoodies",
    brand: "SAFI",
    basePriceCents: 3000,
    isNew: false,
    isTrending: false,
    rbmsoftItemId: "RBM-IT-0009",
    variants: mkVariants("SF-KHD", [{ name: "Red", hex: "#E1261C" }], KIDS_SIZES, "kids"),
  },
  {
    slug: "adidas-own-the-run-jacket",
    nameEn: "adidas Own the Run Jacket",
    descriptionEn: "Wind-resistant running jacket with reflective details.",
    audience: "women",
    category: "jackets",
    brand: "adidas",
    basePriceCents: 8500,
    isNew: true,
    isTrending: false,
    rbmsoftItemId: "RBM-IT-0010",
    variants: mkVariants("AD-OTR", [{ name: "Black", hex: "#111111" }], APPAREL_SIZES, "apparel"),
  },
  {
    slug: "safi-graphic-tee-kids",
    nameEn: "SAFI Graphic Tee Kids",
    descriptionEn: "Playful graphic tee in soft cotton for kids.",
    audience: "kids",
    category: "tees",
    brand: "SAFI",
    basePriceCents: 1800,
    isNew: false,
    isTrending: false,
    rbmsoftItemId: "RBM-IT-0011",
    variants: mkVariants("SF-GTK", [{ name: "White", hex: "#F4F5F7" }], KIDS_SIZES, "kids"),
  },
  {
    slug: "safi-training-set",
    nameEn: "SAFI Training Set",
    descriptionEn: "Two-piece training set — zip top + tapered pants.",
    audience: "unisex",
    category: "sets",
    brand: "SAFI",
    basePriceCents: 5500,
    compareAtPriceCents: 6500,
    isNew: false,
    isTrending: true,
    rbmsoftItemId: "RBM-IT-0012",
    variants: mkVariants(
      "SF-TST",
      [{ name: "Black", hex: "#111111" }, { name: "Red", hex: "#E1261C" }],
      APPAREL_SIZES,
      "apparel",
    ),
  },
];

/** Deterministic demo stock per (barcode, branchCode): a stable pseudo-random
 *  0–9 derived from the barcode digits, so repeated syncs are idempotent and
 *  some rows naturally hit the low-stock threshold. */
export function demoStockQty(barcode: string, branchCode: string): number {
  const digits = [...barcode].map(Number);
  const salt = branchCode === "elmina" ? 3 : 7;
  return (digits.reduce((s, d, i) => s + d * (i + salt), 0) + barcode.length) % 10;
}
