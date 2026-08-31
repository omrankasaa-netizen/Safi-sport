import { adminRouter } from "./admin-router";
import { authRouter } from "./auth-router";
import { catalogRouter } from "./catalog-router";
import { contactMessagesRouter } from "./contact-router";
import { customersRouter } from "./customers-router";
import { inventoryRouter } from "./inventory-router";
import { mediaRouter } from "./media-router";
import { metaRouter } from "./meta-router";
import { checkoutRouter, orderRouter } from "./order-router";
import { productsRouter } from "./products-router";
import { reportsRouter } from "./reports-router";
import { settingsRouter } from "./settings-router";
import { syncRouter } from "./sync-router";
import { transfersRouter } from "./transfers-router";
import { usersRouter } from "./users-router";
import { newsletterRouter } from "./newsletter-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  catalog: catalogRouter,
  checkout: checkoutRouter,
  orders: orderRouter,
  contactMessages: contactMessagesRouter,
  newsletter: newsletterRouter,
  settings: settingsRouter,
  admin: adminRouter,
  inventory: inventoryRouter,
  transfers: transfersRouter,
  products: productsRouter,
  media: mediaRouter,
  customers: customersRouter,
  reports: reportsRouter,
  users: usersRouter,
  sync: syncRouter,
  meta: metaRouter,
});

export type AppRouter = typeof appRouter;
