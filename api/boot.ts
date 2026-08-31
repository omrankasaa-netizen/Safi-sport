import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { clientIpFromHeaders } from "./lib/clientIp";
import { env } from "./lib/env";
import { createGoogleOAuthCallbackHandler, createGoogleOAuthStartHandler } from "./google/auth";
import { expireStaleReservations, runSync } from "./integrations/rbmsoft/syncService";
import { Paths } from "@contracts/constants";
import { SYNC_DELTA_INTERVAL_MS } from "@contracts/constants";

const app = new Hono<{ Bindings: HttpBindings }>();

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 300;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

app.use("/api/*", async (c, next) => {
  const now = Date.now();
  // Rightmost XFF entry (see clientIpFromHeaders) — the previously-used
  // leftmost entry is client-supplied, which let attackers rotate fake IPs
  // to dodge this limit (audit M1). Falls back to the node socket address.
  const key = clientIpFromHeaders(c.req.raw.headers, c.env?.incoming?.socket?.remoteAddress);
  const bucket = rateLimitBuckets.get(key);
  const current = bucket && bucket.resetAt > now
    ? bucket
    : { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  current.count += 1;
  rateLimitBuckets.set(key, current);

  if (rateLimitBuckets.size > 5000) {
    for (const [bucketKey, value] of rateLimitBuckets) {
      if (value.resetAt <= now) rateLimitBuckets.delete(bucketKey);
    }
  }

  if (current.count > RATE_LIMIT_MAX) {
    return c.json({ error: "Too many requests. Please try again shortly." }, 429);
  }

  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  await next();
});

if (env.isProduction) {
  app.use("*", async (c, next) => {
    await next();
    // CSP allows the Meta Pixel (script + connect to graph.facebook.com).
    c.header("Content-Security-Policy", [
      "default-src 'self'",
      "script-src 'self' https://connect.facebook.net",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://graph.facebook.com https://www.facebook.com",
      "frame-src https://www.facebook.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "));
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  });
}

app.use(
  bodyLimit({
    maxSize: 10 * 1024 * 1024,
    onError: (c) =>
      c.json({ error: "Image too large. Please use a smaller photo." }, 413),
  }),
);
app.get(Paths.googleOauthStart, createGoogleOAuthStartHandler());
app.get(Paths.googleOauthCallback, createGoogleOAuthCallbackHandler());

// Health probe for uptime monitors (UptimeRobot) and Railway healthchecks.
app.get("/api/health", (c) =>
  c.json({ ok: true, service: "safi-sport", time: new Date().toISOString() }),
);

// RBMsoft stock webhook: shared-secret header, immediate delta of the given
// barcodes. Fail-soft: 401 on bad secret, 200 on processing errors (the
// failure is recorded in sync_runs — don't invite retries of a poisoned body).
app.post(Paths.rbmsoftStockWebhook, async (c) => {
  const secret = c.req.header("x-rbmsoft-secret") ?? "";
  if (!env.rbmsoftWebhookSecret || secret !== env.rbmsoftWebhookSecret) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  let barcodes: string[] = [];
  try {
    const body = (await c.req.json()) as { barcodes?: unknown };
    if (Array.isArray(body.barcodes)) {
      barcodes = body.barcodes.filter((b): b is string => typeof b === "string").slice(0, 500);
    }
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const result = await runSync("webhook", { barcodes });
  return c.json({ ok: result.status !== "error", runId: result.runId, status: result.status });
});

app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
    // tRPC's default error formatter strips driver-level detail before it
    // reaches the client, so log the real underlying error (and its
    // .cause, where drizzle attaches the raw MySQL driver error) here.
    onError: ({ path, error }) => {
      console.error(`[trpc] ${path ?? "<no-path>"} failed:`, error);
      if (error.cause) console.error("[trpc] cause:", error.cause);
    },
  });
});
app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

export default app;

/** Delta sync every 5 min + reservation janitor, plus a nightly full sync at
 *  03:00. Started only behind SAFI_SYNC_ENABLED=true (SPEC §3). */
function startSyncScheduler() {
  let lastFullSyncDay = "";
  const tick = async () => {
    const now = new Date();
    try {
      await expireStaleReservations(now);
      const isNightlyWindow = now.getHours() === 3 && now.getMinutes() < 5;
      const dayKey = now.toISOString().slice(0, 10);
      if (isNightlyWindow && lastFullSyncDay !== dayKey) {
        lastFullSyncDay = dayKey;
        await runSync("full");
      } else {
        await runSync("delta");
      }
    } catch (error) {
      console.error("[sync] scheduler tick failed:", error);
    }
  };
  const timer = setInterval(() => void tick(), SYNC_DELTA_INTERVAL_MS);
  timer.unref();
  console.log("[sync] scheduler started (delta every 5 min, nightly full at 03:00).");
}

// Dev mode: boot.ts is loaded by the Vite dev server middleware, so the
// production-only block below never runs — start the scheduler here too.
if (!env.isProduction && env.syncEnabled) startSyncScheduler();

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");

  // Apply pending schema migrations at boot. Failures are logged but do not
  // block the static storefront from serving.
  try {
    const { migrate } = await import("drizzle-orm/mysql2/migrator");
    const { getDb } = await import("./queries/connection");
    await migrate(getDb(), { migrationsFolder: "db/migrations" });
    console.log("[db] migrations applied.");
  } catch (error) {
    console.error("[db] migration step failed:", error);
  }

  if (env.syncEnabled) startSyncScheduler();

  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
