/**
 * khClient — drop-in replacement for the Base44 SDK client.
 *
 * The ported storefront UI calls `base44.entities.*` / `base44.auth.*` /
 * `base44.integrations.*`. This module exposes the exact same surface, but
 * every call goes to our own tRPC backend. Security rules live server-side:
 * admin lists/updates are role-gated, order tracking requires a matching
 * contact, and prices are always taken from the database.
 */
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

/* In the sandbox preview, deploy_website rewrites this placeholder to a
   proxy path pointing at the backend running on that port. Locally (npm run
   dev), the placeholder stays literal, so we fall back to the relative path
   that Vite's dev-server plugin already proxies to the same-process API. */
const API_BASE = (() => {
  const placeholder = '__PORT_8090__';
  return placeholder.startsWith('__') ? '' : placeholder;
})();

const client = createTRPCClient({
  links: [
    httpBatchLink({
      url: `${API_BASE}/api/trpc`,
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, { ...(init ?? {}), credentials: 'include' });
      },
    }),
  ],
});

const empty = (v) => (v === '' || v == null ? undefined : v);

/* Product/collection images are stored as root-relative paths (e.g.
   "/assets/designs/foo.jpg"). The backend serves the built client bundle
   (including /assets) as static files, so routing an image through the
   same API_BASE the tRPC client uses works everywhere: locally it stays a
   plain relative path, on Railway API_BASE is empty so the path is still
   root-relative and correct, and in the sandbox preview API_BASE is the
   proxy prefix deploy_website rewrote in, so the image resolves under that
   nested path instead of 404ing against the domain root. */
const resolveAssetUrl = (url) => {
  if (!url || typeof url !== 'string' || !url.startsWith('/')) return url;
  return `${API_BASE}${url}`;
};
const resolveAssetUrls = (urls) => (Array.isArray(urls) ? urls.map(resolveAssetUrl) : urls);

const TONES = ['subtle', 'bold', 'sarcastic', 'clean', 'colorful'];

// SAFI role hierarchy (SPEC §2): viewer(0) < staff(1) < manager(2) < owner(3).
const ROLE_LEVEL = { viewer: 0, staff: 1, manager: 2, owner: 3 };
/** True when the signed-in user's role is at least `minRole` in the hierarchy. */
export function hasRole(user, minRole) {
  return (ROLE_LEVEL[user?.role] ?? 0) >= (ROLE_LEVEL[minRole] ?? 0);
}

function toUiUser(u) {
  if (!u) return null;
  return {
    id: String(u.id),
    full_name: u.name ?? '',
    email: u.email ?? '',
    role: u.role ?? 'viewer',
    avatar: u.avatar ?? null,
  };
}

let meCache;
export async function cachedMe(fresh = false) {
  if (!fresh && meCache !== undefined) return meCache;
  try {
    meCache = toUiUser(await client.auth.me.query());
  } catch {
    meCache = null;
  }
  return meCache;
}

/** True if the canvas actually has any non-opaque pixel (sampled for speed). */
function canvasHasRealTransparency(ctx, width, height) {
  try {
    const { data } = ctx.getImageData(0, 0, width, height);
    // Sample every ~13th pixel's alpha byte — plenty to catch real
    // transparency without scanning every byte of a large image.
    for (let i = 3; i < data.length; i += 4 * 13) {
      if (data[i] < 255) return true;
    }
    return false;
  } catch {
    // Canvas read blocked (shouldn't happen for a local file) — assume no
    // real transparency so we still get the smaller JPEG output.
    return false;
  }
}

/**
 * Downscale an image file client-side and return a data URL, re-encoding as
 * JPEG whenever possible. PNG/WEBP sources only keep PNG output when they
 * contain real transparency — a PNG re-encode of an opaque photo can be
 * several times larger than a JPEG at the same dimensions, which is what
 * was pushing single-image uploads past the server's body-size limit.
 */
/** Exported for the CustomDesign form, which needs guaranteed data-URL
 *  output (its server schema only accepts image/PDF data URLs — the R2
 *  fallback path in UploadFile would return an https URL for staff). */
export async function fileToDataUrl(file, maxDim = 1400, quality = 0.85) {
  const readAs = (f) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(f);
    });

  if (!file.type?.startsWith('image/')) {
    if (file.size > 1_400_000) throw new Error('File too large (max ~1MB).');
    return readAs(file);
  }
  try {
    const bitmap = await createImageBitmap(file);
    let scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    let dataUrl;
    for (let attempt = 0; attempt < 4; attempt++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const mightHaveAlpha = file.type === 'image/png' || file.type === 'image/webp';
      const usePng = mightHaveAlpha && canvasHasRealTransparency(ctx, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL(usePng ? 'image/png' : 'image/jpeg', quality);

      // Comfortably under the server's request-size limit even after
      // multiple images batch together in one request.
      if (dataUrl.length < 1_500_000 || !usePng) break;
      scale *= 0.7; // still oversized (large transparent PNG) — shrink and retry
    }
    return dataUrl;
  } catch {
    if (file.size > 1_400_000) throw new Error('File too large (max ~1MB).');
    return readAs(file);
  }
}

export const kh = {
  entities: {
    Product: {
      /** Public catalog for visitors; full catalog (incl. drafts) for staff+. */
      async list() {
        const me = await cachedMe();
        let rows;
        if (hasRole(me, 'staff')) {
          try {
            rows = await client.admin.productsAll.query();
          } catch {
            /* fall through to public list */
          }
        }
        if (!rows) rows = await client.catalog.products.query();
        return (rows || []).map((p) => ({ ...p, images: resolveAssetUrls(p.images) }));
      },
      create: (data) => client.admin.createProduct.mutate(data),
      update: (id, data) =>
        client.admin.updateProduct.mutate({ id: String(id), data }),
      delete: (id) => client.admin.deleteProduct.mutate({ id: String(id) }),
      /** Permanent delete — server enforces super_admin. */
      hardDelete: (id) => client.admin.hardDeleteProduct.mutate({ id: String(id) }),
      /** Bulk Import page: creates many products (each with its own color photos) in one call. */
      bulkCreate: (items) => client.admin.bulkCreateProducts.mutate({ items }),
      /** Products list selection toolbar: set many products' status at once. */
      bulkUpdateStatus: (ids, status) =>
        client.admin.bulkUpdateProductStatus.mutate({ ids: ids.map(String), status }),
      /** Products list selection toolbar: permanent batch delete — server enforces super_admin. */
      bulkHardDelete: (ids) => client.admin.bulkHardDeleteProducts.mutate({ ids: ids.map(String) }),
    },

    Order: {
      /**
       * Admin-only: paged order list. Server enforces the staff role.
       * Accepts { limit, offset } and tolerates legacy base44-style
       * list('-created_date', 200) calls (the number is taken as limit).
       */
      list(sortOrOpts, maybeLimit) {
        const opts = typeof sortOrOpts === 'object' && sortOrOpts !== null ? sortOrOpts : {};
        const limit = opts.limit ?? (typeof maybeLimit === 'number' ? maybeLimit : undefined);
        return client.admin.orders.query({ limit, offset: opts.offset });
      },

      /**
       * filter({ order_number, contact }) → guest tracking (server verifies
       * the contact matches the order). filter({ email }) → the signed-in
       * user's own orders (email comes from the session, never the client).
       */
      async filter(criteria = {}) {
        if (criteria.order_number) {
          const o = await client.orders.track.query({
            orderNumber: criteria.order_number,
            contact: criteria.contact ?? '',
          });
          return o ? [o] : [];
        }
        return client.orders.mine.query();
      },

      /**
       * Access-gated on the server: staff, the owning session, or a
       * matching email/phone (`contact` — checkout stashes it in
       * sessionStorage for the confirmation page).
       */
      get: (id, contact) =>
        client.orders.get.query({ id: String(id), contact: contact || undefined }),

      /** Prices, order number and totals are computed server-side. */
      create: (data) =>
        client.orders.create.mutate({
          email: data.email,
          phone: data.phone,
          fullName: data.full_name,
          shippingAddress: data.shipping_address,
          city: data.city,
          country: data.country,
          notes: empty(data.notes),
          language: data.language === 'ar' ? 'ar' : 'en',
          paymentMethod: data.payment_method === 'whish' ? 'whish' : 'cash_on_delivery',
          items: (data.items ?? []).map((i) => ({
            productId: String(i.productId),
            color: i.color,
            size: i.size,
            quantity: i.quantity,
          })),
          promoCode: empty(data.promo_code),
          // Honeypot — humans never fill this hidden field; the server
          // fake-succeeds without creating an order when it's set.
          company: empty(data.company),
        }),

      update: (id, data) =>
        client.admin.updateOrderStatus.mutate({ id: String(id), status: data.status }),
      /** Permanent delete — server enforces super_admin. */
      hardDelete: (id) => client.admin.hardDeleteOrder.mutate({ id: String(id) }),
      /** Manual "Send follow-up" button in the admin panel. */
      sendFollowupEmail: (id) => client.admin.sendOrderFollowupEmail.mutate({ id: String(id) }),
      /** Courier handoff: which courier company took the parcel. */
      markHandedToCourier: (id, courierName) =>
        client.admin.markHandedToCourier.mutate({ id: String(id), courier_name: courierName }),
      /** COD settlement: the courier paid us this order's cash. */
      markCashCollected: (id) => client.admin.markCashCollected.mutate({ id: String(id) }),
    },

    /** Store config: banner, feature toggles, and payment-method control
     * (cash on delivery / Whish). `get` is public — the storefront reads it
     * for checkout options and Whish instructions. `update` is admin-only. */
    Settings: {
      get: () => client.settings.get.query(),
      update: (patch) => client.settings.update.mutate(patch),
    },

    Collection: {
      list: async () => {
        const rows = await client.catalog.collections.query();
        return (rows || []).map((c) => ({ ...c, cover_image: resolveAssetUrl(c.cover_image) }));
      },
      create: (data) => client.admin.createCollection.mutate(data),
      update: (id, data) => client.admin.updateCollection.mutate({ id: String(id), ...data }),
      remove: (id) => client.admin.deleteCollection.mutate({ id: String(id) }),
      reorder: (ids) => client.admin.reorderCollections.mutate({ ids: ids.map(String) }),
    },
    GarmentColor: { list: () => client.catalog.garmentColors.query() },
    GarmentStyle: { list: () => client.catalog.garmentStyles.query() },

    CustomProject: {
      /** Admin-only list. */
      list: () => client.admin.customRequests.query(),
      /** Staff-only status change for a custom request. */
      updateStatus: (id, status) => client.admin.updateCustomRequestStatus.mutate({ id: String(id), status }),
      create: (data) =>
        client.customRequests.submit.mutate({
          name: data.name,
          email: data.email,
          phone: empty(data.phone),
          phrase: data.phrase,
          story: empty(data.story),
          language: data.language === 'ar' ? 'ar' : 'en',
          recipient: empty(data.recipient),
          occasion: empty(data.occasion),
          tone: TONES.includes(data.tone) ? data.tone : undefined,
          garment: empty(data.garment),
          color: empty(data.color),
          size: empty(data.size),
          quantity: Number(data.quantity) || 1,
          placement: empty(data.placement),
          needed_by: empty(data.needed_by),
          notes: empty(data.notes),
          reference_files: data.reference_files?.length ? data.reference_files : undefined,
          rights_confirmed: data.rights_confirmed ?? data.rights ?? false,
        }),
    },

    ContactMessages: {
      /** Admin/staff-only list. */
      list: () => client.contactMessages.list.query(),
      create: (data) =>
        client.contactMessages.submit.mutate({
          name: data.name,
          email: data.email,
          phone: empty(data.phone),
          message: data.message,
        }),
      updateStatus: (id, status) => client.contactMessages.updateStatus.mutate({ id, status }),
    },

    Newsletter: {
      /** Public: Footer signup form. Duplicate emails succeed silently. */
      subscribe: (email, language) => client.newsletter.subscribe.mutate({ email, language }),
      /** Staff-only list for the admin Messages page. */
      list: () => client.newsletter.list.query(),
    },

    User: { list: () => client.admin.users.query() },

    Staff: {
      list: () => client.admin.staff.query(),
      upsert: (data) => client.admin.upsertStaff.mutate(data),
      remove: (email) => client.admin.removeStaff.mutate({ email }),
    },

    Colors: {
      list: () => client.catalog.garmentColors.query(),
      create: (data) => client.admin.createGarmentColor.mutate(data),
      update: (id, data) => client.admin.updateGarmentColor.mutate({ id: String(id), ...data }),
      remove: (id) => client.admin.deleteGarmentColor.mutate({ id: String(id) }),
      reorder: (ids) => client.admin.reorderGarmentColors.mutate({ ids: ids.map(String) }),
    },

    Styles: {
      list: () => client.catalog.garmentStyles.query(),
      create: (data) => client.admin.createGarmentStyle.mutate(data),
      update: (id, data) => client.admin.updateGarmentStyle.mutate({ id: String(id), ...data }),
      remove: (id) => client.admin.deleteGarmentStyle.mutate({ id: String(id) }),
    },

    BlankStock: {
      list: () => client.admin.blankStock.query(),
      upsertVariant: (data) => client.admin.upsertStockVariant.mutate(data),
      adjust: (data) => client.admin.adjustStock.mutate({ ...data, id: String(data.id) }),
      movements: (stockId) =>
        client.admin.stockMovements.query(stockId ? { stockId: String(stockId) } : undefined),
    },

    FactoryOrder: {
      list: () => client.admin.factoryOrders.query(),
      generatePrintJob: (orderIds) =>
        client.admin.generatePrintJob.mutate({ orderIds: orderIds.map(String) }),
      createRestock: (items, notes) => client.admin.createRestockRequest.mutate({ items, notes }),
      markSent: (id) => client.admin.markFactoryOrderSent.mutate({ id: String(id) }),
      markFulfilled: (id) => client.admin.markFactoryOrderFulfilled.mutate({ id: String(id) }),
      cancel: (id) => client.admin.cancelFactoryOrder.mutate({ id: String(id) }),
    },

    Financials: {
      getUnitCosts: () => client.admin.unitCosts.query(),
      updateUnitCosts: (data) => client.admin.updateUnitCosts.mutate(data),
      getGarmentCosts: () => client.admin.garmentCosts.query(),
      updateGarmentCost: (data) => client.admin.updateGarmentCost.mutate(data),
      listExpenses: (from, to) => client.admin.overheadExpenses.query({ from, to }),
      addExpense: (data) => client.admin.addOverheadExpense.mutate(data),
      deleteExpense: (id) => client.admin.deleteOverheadExpense.mutate({ id: String(id) }),
      getSummary: (from, to) => client.admin.financialSummary.query({ from, to }),
      codOutstandingByCourier: (from, to) => client.admin.codOutstandingByCourier.query({ from, to }),
      getProfitShares: () => client.admin.profitShares.query(),
      updateProfitShares: (shares) => client.admin.updateProfitShares.mutate({ shares }),
      listFactoryPayments: (from, to) => client.admin.factoryPayments.query({ from, to }),
      addFactoryPayment: (data) => client.admin.addFactoryPayment.mutate(data),
      deleteFactoryPayment: (id) => client.admin.deleteFactoryPayment.mutate({ id: String(id) }),
      getFactoryPayable: () => client.admin.factoryPayable.query(),
      listMargins: () => client.admin.productMargins.query(),
      updateProductCost: (id, costPrice) =>
        client.admin.updateProductCost.mutate({ id: String(id), cost_price: costPrice }),
    },

    ProductColorImages: {
      // Public read — the storefront (anonymous shoppers) and the admin editor
      // both need this to show the correct per-color garment photo. Writes
      // below stay staff-gated on the server.
      list: async (productId) => {
        const rows = await client.catalog.productColorImages.query({ productId: String(productId) });
        return (rows || []).map((r) => ({ ...r, images: resolveAssetUrls(r.images) }));
      },
      upsert: (productId, colorName, images) =>
        client.admin.upsertProductColorImages.mutate({ productId: String(productId), colorName, images }),
      remove: (productId, colorName) =>
        client.admin.deleteProductColorImages.mutate({ productId: String(productId), colorName }),
    },

    Promotions: {
      promoCodes: {
        list: () => client.admin.promoCodes.query(),
        create: (data) => client.admin.createPromoCode.mutate(data),
        update: (id, data) => client.admin.updatePromoCode.mutate({ id: String(id), data }),
        remove: (id) => client.admin.deletePromoCode.mutate({ id: String(id) }),
      },
      discounts: {
        list: () => client.admin.discounts.query(),
        create: (data) => client.admin.createDiscount.mutate(data),
        update: (id, data) => client.admin.updateDiscount.mutate({ id: String(id), data }),
        remove: (id) => client.admin.deleteDiscount.mutate({ id: String(id) }),
      },
      campaigns: {
        list: () => client.admin.campaigns.query(),
        create: (data) => client.admin.createCampaign.mutate(data),
        update: (id, data) => client.admin.updateCampaign.mutate({ id: String(id), data }),
        remove: (id) => client.admin.deleteCampaign.mutate({ id: String(id) }),
      },
      previewCode: (code, subtotal) => client.orders.previewPromoCode.query({ code, subtotal }),
      previewCartDiscounts: (items) => client.orders.previewCartDiscounts.query(items),
      activeCampaigns: () => client.orders.activeCampaigns.query(),
    },

    Loyalty: {
      /** Tier + perks for the signed-in user (Profile page). Server-side the
       *  lookup is authenticated and scoped to the session email — the
       *  argument is ignored (kept for the Profile call site's signature). */
      myStatus: (_email) => client.loyalty.myStatus.query(),
      /** Read-only: what THIS order's net subtotal (post automatic-discount, in dollars) would get under the current tier. No DB writes. */
      preview: (email, netSubtotal) => client.orders.previewLoyalty.query({ email, netSubtotal }),
      admin: {
        list: (search) => client.admin.loyaltyAccounts.query(search ? { search } : undefined),
        update: (email, patch) => client.admin.updateLoyaltyAccount.mutate({ email, patch }),
      },
    },
  },

  auth: {
    me: () => cachedMe(true),
    /** Email sign-in step 1: mail a 6-digit code. */
    requestEmailOtp: (email, language) => client.auth.requestEmailOtp.mutate({ email, language }),
    /** Email sign-in step 2: verify the code, which sets the session cookie server-side. */
    async verifyEmailOtp(email, code) {
      await client.auth.verifyEmailOtp.mutate({ email, code });
      return cachedMe(true);
    },
    async logout() {
      try {
        await client.auth.logout.mutate();
      } catch {
        /* session may already be gone */
      }
      meCache = null;
    },
    async isAuthenticated() {
      return (await cachedMe()) != null;
    },
    redirectToLogin(returnTo) {
      const target = returnTo || window.location.href;
      window.location.href = `/login?returnTo=${encodeURIComponent(target)}`;
    },
  },

  integrations: {
    Core: {
      /**
       * Downscales the file client-side, then hands the data URL to the
       * backend to store on R2 and return a short CDN URL. If R2 isn't
       * configured (or the request fails), the original data URL is kept
       * so uploads keep working exactly as before.
       */
      UploadFile: async ({ file }) => {
        const dataUrl = await fileToDataUrl(file);
        try {
          const { url } = await client.admin.uploadImage.mutate({ dataUrl });
          return { file_url: url };
        } catch {
          return { file_url: dataUrl };
        }
      },
    },
  },

  /** Meta Pixel/CAPI helpers (see src/lib/metaPixel.js). Fire-and-forget
      marketing endpoints — both safe no-ops when CAPI isn't configured. */
  meta: {
    track: (data) => client.meta.track.mutate(data),
    purchase: (data) => client.meta.purchase.mutate(data),
  },

  /** Import from Drive admin tool: one-time Drive connect + folder scan/commit. */
  driveImport: {
    status: () => client.admin.driveStatus.query(),
    disconnect: () => client.admin.driveDisconnect.mutate(),
    scan: (folderLink) => client.admin.driveScan.mutate({ folderLink }),
    commit: (items) => client.admin.driveCommit.mutate({ items }),
  },
};

// The UI imports `{ base44 }` — keep that name working 1:1.
export const base44 = kh;
