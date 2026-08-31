import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";
import { injectSeoMeta, metaForPath, registerSeoRoutes } from "./seo";

type App = Hono<{ Bindings: HttpBindings }>;

export function serveStaticFiles(app: App) {
  const distPath = path.resolve(import.meta.dirname, "../dist/public");
  const indexPath = path.resolve(distPath, "index.html");

  // SEO routes before the static/SPA fallback: /sitemap.xml + /robots.txt
  // are generated from the DB (SPEC §5).
  registerSeoRoutes(app);

  app.use("*", serveStatic({ root: "./dist/public" }));

  app.notFound(async (c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    const template = fs.readFileSync(indexPath, "utf-8");
    // Rewrite <head> per route (Product JSON-LD on /product/:slug,
    // LocalBusiness w/ both branches on /) so crawlers that don't execute
    // JS still get full metadata. Fail-soft: any error → plain template.
    try {
      const pathname = new URL(c.req.url).pathname;
      const meta = await metaForPath(pathname);
      return c.html(injectSeoMeta(template, meta));
    } catch {
      return c.html(template);
    }
  });
}
