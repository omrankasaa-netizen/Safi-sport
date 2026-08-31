import { and, eq } from "drizzle-orm";
import * as schema from "@db/schema";
import { getDb } from "../api/queries/connection";
import { env } from "../api/lib/env";
import { DEMO_PRODUCTS, demoStockQty } from "../api/integrations/rbmsoft/demoCatalog";

/**
 * SAFI SPORT seed: the two Tripoli branches, the owner staff-role entry
 * (from SAFI_OWNER_EMAIL), and 12 DEMO sportswear products with variants +
 * branch_stock for both branches. All demo products are marked as such in
 * their descriptions ("DEMO"). Idempotent: existing rows (matched by unique
 * keys) are skipped. Prices in USD cents.
 */

const BRANCHES = [
  {
    code: "elmina",
    nameEn: "El Mina",
    nameAr: "الميناء",
    address: "El Mina Corniche, Tripoli, Lebanon",
    phone: "+961 81 498 942",
    whatsapp: "+96181498942",
    mapsUrl: "https://maps.google.com/?q=El+Mina,+Tripoli,+Lebanon",
  },
  {
    code: "dam",
    nameEn: "Dam w Farez",
    nameAr: "الضم والفرز",
    address: "Dam w Farez, Tripoli, Lebanon",
    phone: "+961 81 498 942",
    whatsapp: "+96181498942",
    mapsUrl: "https://maps.google.com/?q=Dam+w+Farez,+Tripoli,+Lebanon",
  },
] as const;

async function seedBranches() {
  const db = getDb();
  for (const b of BRANCHES) {
    const [existing] = await db.select().from(schema.branches).where(eq(schema.branches.code, b.code)).limit(1);
    if (existing) continue;
    await db.insert(schema.branches).values(b);
    console.log(`+ branch ${b.nameEn} (${b.code})`);
  }
}

async function seedOwnerRole() {
  const ownerEmail = env.ownerEmail;
  if (!ownerEmail) {
    console.log("SAFI_OWNER_EMAIL not set — skipping owner staff_role seed.");
    return;
  }
  const db = getDb();
  const [existing] = await db.select().from(schema.staffRoles).where(eq(schema.staffRoles.email, ownerEmail)).limit(1);
  if (existing) return;
  await db.insert(schema.staffRoles).values({ email: ownerEmail, name: "Owner", role: "owner" });
  console.log(`+ owner staff_role ${ownerEmail}`);
}

/** Maps seeded/demo branch codes to their DB ids. */
async function branchIdByCode(): Promise<Map<string, number>> {
  const rows = await getDb().select().from(schema.branches);
  return new Map(rows.map((b) => [b.code, b.id]));
}

async function seedDemoCatalog() {
  const db = getDb();
  const branchIds = await branchIdByCode();

  for (const p of DEMO_PRODUCTS) {
    const [existing] = await db.select().from(schema.products).where(eq(schema.products.slug, p.slug)).limit(1);
    let productId = existing?.id;

    if (!productId) {
      const [inserted] = await db
        .insert(schema.products)
        .values({
          slug: p.slug,
          nameEn: p.nameEn,
          nameAr: p.nameAr ?? null,
          // DEMO marker: demo products are replaced by real catalog data
          // when RBMsoft goes live.
          descriptionEn: `[DEMO] ${p.descriptionEn}`,
          audience: p.audience,
          category: p.category,
          brand: p.brand,
          basePriceCents: p.basePriceCents,
          compareAtPriceCents: p.compareAtPriceCents ?? null,
          status: "active",
          isNew: p.isNew,
          isTrending: p.isTrending,
          rbmsoftItemId: p.rbmsoftItemId,
        })
        .$returningId();
      productId = inserted.id;
      console.log(`+ product ${p.nameEn}`);
    }

    for (const v of p.variants) {
      const [existingVariant] = await db
        .select()
        .from(schema.productVariants)
        .where(eq(schema.productVariants.sku, v.sku))
        .limit(1);
      let variantId = existingVariant?.id;

      if (!variantId) {
        const [inserted] = await db
          .insert(schema.productVariants)
          .values({
            productId,
            sku: v.sku,
            barcode: v.barcode,
            color: v.color,
            colorHex: v.colorHex,
            size: v.size,
            sizeType: v.sizeType,
            priceOverrideCents: v.priceOverrideCents ?? null,
            rbmsoftVariantId: `${p.rbmsoftItemId}:${v.barcode}`,
            isActive: true,
          })
          .$returningId();
        variantId = inserted.id;
      }

      for (const branchCode of ["elmina", "dam"] as const) {
        const branchId = branchIds.get(branchCode);
        if (!branchId) continue;
        const [existingStock] = await db
          .select()
          .from(schema.branchStock)
          .where(and(eq(schema.branchStock.variantId, variantId), eq(schema.branchStock.branchId, branchId)))
          .limit(1);
        if (existingStock) continue;
        await db.insert(schema.branchStock).values({
          variantId,
          branchId,
          qtyOnHand: demoStockQty(v.barcode, branchCode),
          reservedOnline: 0,
          syncSource: "seed",
        });
      }
    }
  }
  console.log("Demo catalog seeded (12 demo products, variants, branch_stock).");
}

async function seedSettings() {
  const db = getDb();
  const defaults: [string, unknown][] = [
    ["pixel.enabled", true],
    ["pixel.consentRequired", false],
    ["delivery.feeCents", env.deliveryFeeCents],
    ["store.whatsapp", "+96181498942"],
    ["store.instagram", "safisport"],
    ["branch.hours", "Mon–Sat 10:00–21:00, Sun 12:00–20:00"],
  ];
  for (const [key, value] of defaults) {
    const [existing] = await db.select().from(schema.siteSettings).where(eq(schema.siteSettings.key, key)).limit(1);
    if (existing) continue;
    await db.insert(schema.siteSettings).values({ key, value });
  }
  console.log("Default site settings seeded.");
}

async function seed() {
  await seedBranches();
  await seedOwnerRole();
  await seedDemoCatalog();
  await seedSettings();
  console.log("SAFI SPORT seed complete.");
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
