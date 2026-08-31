# SAFI SPORT — Commerce

Full-stack ecommerce + store-ops system for SAFI SPORT, a sportswear retailer
in Tripoli, Lebanon (branches: **El Mina** and **Dam w Farez**). COD-first,
WhatsApp-centric, barcode-driven inventory with an RBMsoft stock integration
(runs end-to-end on a mock driver until the real API is available).

## Stack

- **Frontend:** React 19 + Vite 7 + Tailwind 3.4 + react-router 7 (storefront
  `src/`, admin panel `src/pages/admin/`)
- **Backend:** Hono (Node) + tRPC v11 (`api/`), served from the same process
- **DB:** MySQL via Drizzle ORM (`db/schema.ts`, migrations in `db/migrations/`)
- **Auth:** email OTP (Resend) or staff Google sign-in → httpOnly JWT session
  cookie (7-day expiry). Roles: `viewer` < `staff` < `manager` < `owner`.
- **Stock:** RBMsoft adapter (`api/integrations/rbmsoft/`) — `mock` driver by
  default, generic `http` driver with env-configurable field mapping.
- **Marketing:** Meta Pixel + Conversions API (server-side Purchase only,
  SHA-256-hashed PII, event_id dedup, consent banner with Decline path).
- **Media:** sharp (WebP 400/1200px, EXIF stripped) → Cloudflare R2, with a
  fail-soft local `/uploads` fallback.

## Quickstart

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL + APP_SECRET (32+ chars)
npm run db:push             # create schema in your MySQL database
npm run db:seed             # branches, owner role, demo catalog + stock
npm run dev                 # http://localhost:3000 (storefront + API + admin)
```

Production:

```bash
npm run build               # vite build + esbuild api/boot.ts → dist/
npm start                   # NODE_ENV=production node dist/boot.js
```

Checks: `npm run check` (tsc), `npm test` (vitest — pipeline/pricing/CAPI/
validation), `npm run lint`.

### Demo logins

Admin sign-in is **email OTP** (no passwords). To log in locally:

1. Set `SAFI_OWNER_EMAIL=you@example.com` before `npm run db:seed` — the seed
   inserts that address into `staff_roles` with the `owner` role.
2. Configure `RESEND_API_KEY` + `EMAIL_FROM` so the 6-digit code email
   actually sends (without Resend, no email goes out and there is no dev
   console fallback — this is deliberate).
3. Alternatively enable staff Google sign-in (`GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `VITE_GOOGLE_CLIENT_ID`) and whitelist addresses in
   `SAFI_ADMIN_ALLOWED_EMAILS`.

## Environment variables

See `.env.example` for the annotated template.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | MySQL connection string |
| `APP_SECRET` | yes | JWT session signing secret (32+ chars) |
| `PORT` | no (3000) | HTTP port for the production server |
| `SAFI_OWNER_EMAIL` | yes | Seeded into `staff_roles` as owner |
| `SAFI_ADMIN_ALLOWED_EMAILS` | no | Comma-separated staff emails allowed into admin |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `VITE_GOOGLE_CLIENT_ID` | no | Staff Google sign-in |
| `SAFI_META_PIXEL_ID` / `SAFI_META_CAPI_ACCESS_TOKEN` / `SAFI_META_TEST_EVENT_CODE` | no | Meta Pixel + CAPI (pixel hidden when unset) |
| `SAFI_RBMSOFT_DRIVER` | no (`mock`) | `mock` or `http` |
| `SAFI_RBMSOFT_BASE_URL` / `SAFI_RBMSOFT_API_KEY` | http driver | RBMsoft REST endpoint + credential |
| `SAFI_RBMSOFT_ITEMS_PATH` / `SAFI_RBMSOFT_STOCK_PATH` / `SAFI_RBMSOFT_SALE_PATH` | http driver | Endpoint paths |
| `SAFI_RBMSOFT_WEBHOOK_SECRET` | no | Shared secret for `POST /webhooks/rbmsoft/stock` (header `x-rbmsoft-secret`) |
| `SAFI_SYNC_ENABLED` | no (`false`) | `true` starts the 5-min delta sync, nightly full sync, and the reservation janitor |
| `SAFI_DELIVERY_FEE_CENTS` | no (300000) | Flat delivery fee ($3.00); pickup is free |
| `SAFI_CURRENCY` | no (`USD`) | Store currency |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_BASE_URL` | no | Product photo storage; local `/uploads` fallback when unset |
| `RESEND_API_KEY` / `EMAIL_FROM` / `SAFI_ADMIN_NOTIFICATION_EMAIL` | no | OTP + order notification emails |

## RBMsoft go-live (when the real API details arrive)

1. Set `SAFI_RBMSOFT_DRIVER=http` and fill `SAFI_RBMSOFT_BASE_URL` +
   `SAFI_RBMSOFT_API_KEY`.
2. Map the real API's response shape in
   `api/integrations/rbmsoft/fieldMap.ts` — item/stock field names are
   configurable there, no other code changes needed. Override endpoint paths
   via `SAFI_RBMSOFT_ITEMS_PATH` / `SAFI_RBMSOFT_STOCK_PATH` /
   `SAFI_RBMSOFT_SALE_PATH` if they differ from `/items`, `/stock`, `/sales`.
3. Set `SAFI_RBMSOFT_WEBHOOK_SECRET` and point RBMsoft (or middleware) at
   `POST /webhooks/rbmsoft/stock` with header `x-rbmsoft-secret` and body
   `{ "barcodes": [...] }` for immediate stock deltas.
4. Set `SAFI_SYNC_ENABLED=true` — this starts the 5-minute delta sync, the
   03:00 nightly full sync, and the stock-reservation janitor.
5. Trigger a manual full sync from **Admin → Settings → Sync now**, then check
   **Admin → Inventory → Conflicts** for `unknown_barcode` /
   `reserved_exceeds_physical` / `push_failed` rows.
6. Once RBMsoft is the source of truth, the demo products seeded by
   `db/seed.ts` (marked as demo) can be archived — real items upsert by
   barcode.

## Deploy

- **Docker:** the root `Dockerfile` builds the frontend, bundles
  `api/boot.ts` into `dist/`, restores binary assets via
  `scripts/restore-assets.sh`, and starts `node dist/boot.js`. Migrations run
  automatically at boot. Provide all env vars from the table above.
- **Railway:** create a MySQL plugin + a service from this repo (Dockerfile
  deploy). Set `DATABASE_URL` to the plugin's connection string, `APP_SECRET`,
  and the rest of the env vars. Run `npm run db:seed` once (Railway shell) to
  seed branches, the owner role, and the demo catalog.
- Health expectations: static storefront and `/robots.txt` / `/sitemap.xml`
  serve even if the database is briefly unreachable (DB-backed routes fail
  soft with JSON errors, the process never crashes).

## Security notes

- All tRPC inputs are zod-validated; all SQL is Drizzle-parameterized.
- Session cookie is `httpOnly` + `secure` (off only on localhost), JWT
  expires in 7 days; email OTP is capped at 5 attempts with a 60s resend
  cooldown.
- Rate limits: global API bucket plus stricter per-IP limits on order create
  (5/hr), order lookup (20/10min), newsletter (10/hr), and Meta endpoints.
  Checkout also carries a honeypot field.
- Production CSP allows only `connect.facebook.net` (script) and
  `graph.facebook.com` (connect) for the pixel, plus Google Fonts; uploads are
  mime-sniffed via sharp, capped at 8 MB, re-encoded to WebP, EXIF stripped.
- Every mutation writes an `audit_logs` row; `robots.txt` disallows `/admin`
  and `/api`; secrets live only in env vars (`.env` is git-ignored — never
  commit it).
