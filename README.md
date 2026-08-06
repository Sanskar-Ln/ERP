# Jewellery & Gems ERP (MVP)

Multi-tenant SaaS ERP for Indian jewellery & gems retailers.

| Folder | What it is | Port |
|--------|-----------|------|
| `apps/api` | NestJS + Prisma + PostgreSQL REST API (Swagger at `/api/docs`) | 3001 |
| `apps/web` | Next.js web admin (owner/back-office) | 3000 |
| `apps/mobile` | Expo mobile app — **two views**: manager (admin from the phone) & sales counter | Expo |
| `packages/shared` | shared TS types, zod schemas, money/weight fixed-point math | — |

Each folder is self-contained with its own README; nothing is mixed across
apps — the only shared code lives in `packages/shared`.

More documentation: **PLAN.md** (milestones + GST facts) ·
**ARCHITECTURE.md** (system map + non-negotiable rules) ·
**PROGRESS.md** (build log) · **REPORT.md** (final report, coverage, gaps).

---

## Running everything from scratch

### 0. Prerequisites

- **Node.js ≥ 20** and **pnpm 10** (`npm i -g pnpm`)
- **PostgreSQL ≥ 14** running locally
- (mobile only) **Expo Go** app on your phone, or an Android/iOS emulator

### 1. Install all workspace dependencies (once, from the repo root)

```sh
pnpm install
```

### 2. Database

Create the database and user the API expects (any names work — they just
have to match your `.env`):

```sh
sudo -u postgres psql -c "CREATE USER erp WITH PASSWORD 'erp' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE erp OWNER erp;"
```

### 3. API (`apps/api`, port 3001)

```sh
cd apps/api
cp .env.example .env        # check DATABASE_URL, set a real JWT_SECRET
pnpm prisma:migrate         # create the schema (Prisma migrations)
pnpm seed                   # demo tenant, branches, users, tax matrix, rates
pnpm dev                    # start (tsx watch) — or: pnpm build && pnpm start
```

Check it: <http://localhost:3001/api/v1/health> → `{"status":"ok"}`,
Swagger docs at <http://localhost:3001/api/docs>.

### 4. Web admin (`apps/web`, port 3000)

```sh
# from the repo root (new terminal)
pnpm --filter @erp/web dev
```

The web admin is **fully responsive with an app-like feel**: on phones it
mirrors the mobile app — espresso top bar, bottom tab bar with icons —
while desktops get the full sidebar. Billing shows the selected
customer's complete bill history inline (the recurring-customer view),
same as the app.

Open <http://localhost:3000> and sign in (logins below), or create a brand
new organisation at <http://localhost:3000/register> — every registration
provisions a fully isolated tenant (own branches, staff, stock, billing).
If the API runs elsewhere, set `NEXT_PUBLIC_API_URL` first.

The **Customers** page shows the recurring-customer view: pick a customer
to see ALL their system documents plus their uploaded **paper bills**
(photo/scan of old bills, JPEG/PNG/WebP/PDF up to 10 MB), with upload and
in-browser viewing. A **read (OCR)** button reads an uploaded bill photo
server-side and shows the recognized fields (bill no, date, total,
weights, rate, phone) as a draft to copy into a new online bill.

The **Billing** page has **CSV report downloads** (ADMIN only): the
bills register (one row per document, taxes split
CGST/SGST/IGST) and the GST summary (totals per rate bucket) for any
date range.

### 5. Mobile (`apps/mobile`) — bare React Native (CLI)

The mobile app uses the React Native **CLI** (not Expo), so the native
`android/` and `ios/` projects live in the repo. Running it needs the
native toolchains: **Android Studio + SDK** for Android, **macOS + Xcode
+ CocoaPods** for iOS.

```sh
# from the repo root (new terminal)
pnpm --filter @erp/mobile start           # Metro dev server
pnpm --filter @erp/mobile android         # build + run on an emulator/device
# iOS (macOS only): cd apps/mobile/ios && pod install, then:
pnpm --filter @erp/mobile ios
```

Set the API base in `apps/mobile/src/lib/config.ts` — the Android emulator
reaches the host at `http://10.0.2.2:3001/api/v1`; a real device needs the
machine's LAN address (a device can't reach your `localhost`). See
`apps/mobile/README.md` for the fonts, camera and pnpm-monorepo notes.

The app picks its view from the login role:

- **Admin view** (`admin@demo.in`) — Dashboard, Stock (create items,
  adjustments, receive transfers), full Billing (invoice/estimate/
  challan, customer bill history, convert, cancel), Rates.
- **Counter view** (`ops@demo.in`) — Rates, scan-to-price stock lookup,
  Estimate creation.

Both views have a **camera barcode scanner** (Scan button next to every
item-code field; Code128 + DataMatrix). A USB/Bluetooth scanner in
keyboard mode also works — it just types into the same fields.

### 6. Demo logins (after seeding — password `demo1234` for both)

Two roles only. **ADMIN** has full access; **OPS** covers the day-to-day:
billing (issue/convert), stock adjustments, customers, suppliers/karigars,
and the daily board-rate fix. OPS cannot touch masters, staff, tagging,
transfers, reports, or corrections (cancel / movement reverse).

| Email | Role | Sees |
|-------|------|------|
| admin@demo.in | ADMIN | everything (full web nav + mobile admin view) |
| ops@demo.in | OPS | web: Dashboard / Customers / Inventory / Orders / Billing; mobile counter view |

The **Orders** page is the counter & workshop pipeline
(DRAFT → CONFIRMED → PROCESSING → READY → DELIVERED → COMPLETED):
confirming an order holds its stock items (RESERVED), delivery requires
the billing document, and cancelling (admin) releases the hold.
**Purchases** (admin) runs procurement: supplier → purchase order →
weight-verified goods receipt, which creates the intake lot you then add
items against on Inventory — plus append-only supplier payments.

### 7. Tests & checks

```sh
pnpm -r test          # 79 unit tests (money, weights, GST, tenancy, …)
pnpm -r typecheck     # all four packages
pnpm -r run build     # full workspace build
```

### Troubleshooting

- **API won't start / P1001** — PostgreSQL isn't running or
  `DATABASE_URL` is wrong.
- **`pnpm seed` says "already exists"** — the demo tenant is seeded once;
  that's fine, it's idempotent.
- **Mobile shows network errors** — `expo.extra.apiUrl` still points at
  `localhost`; use the LAN address.
- **403 on some action** — RBAC is enforced server-side; sign in with a
  role that's allowed (see table above).
