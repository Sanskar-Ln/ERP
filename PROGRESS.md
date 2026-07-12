# PROGRESS

Live status of the MVP build. Updated at every milestone. See PLAN.md for
the full milestone list and ARCHITECTURE.md for the system map.

## Done

- **M0 — Monorepo scaffold**: pnpm workspace, base tsconfig, root docs.
- **M1 — `packages/shared`**: enums, zod schemas, money/weight fixed-point
  math. 38 unit tests.
- **M2 — API platform**: NestJS app boots; full Prisma schema + initial
  migration (all modules' tables, UUID PKs, BigInt paise, Decimal weights);
  tenant-scoped Prisma client (`scopeArgs`, 9 unit tests); JWT auth +
  register/login/me/users endpoints; RBAC guards; append-only AuditService;
  ZodPipe validation + zod→OpenAPI; Swagger at /api/docs. Smoke-tested
  end-to-end against local Postgres.

- **M3 — Master data**: metals/purities, stone types, HSN codes,
  tax-rule matrix (pure `resolveTaxRule` domain fn, 5 tests) with
  `/tax-rules/resolve` dry-run, customers+KYC/suppliers/karigars,
  append-only metal-rate board (`/metal-rates/latest`, audited MANUAL_FIX).
  `prisma/seed.ts` seeds demo tenant + 2026 India GST defaults.
  Smoke-tested incl. RBAC denial.

- **M4 — Inventory**: composite items (metal+stone components, 4Cs,
  certificates; creation tx = item + components + PURCHASE_IN + audit),
  lots, append-only movement ledger with once-only REVERSAL, direct-post
  whitelist, inter-branch transfers (OUT/IN pair, status re-homing),
  dual-unit /stock/summary. Domain movement-rules (5 tests). Smoke-tested
  full cycle: create → adjust → reverse → transfer → receive.

- **M5 — Tagging & barcode**: per-piece tags (`ITEMCODE#ordinal`,
  capped at piece count), scan endpoint, bwip-js PNG rendering (Code128
  default, DataMatrix verified), label templates (mm size + field list),
  batch HTML label sheets with data-URI barcodes. Price-free payload
  triple-enforced (domain fns, 4 tests). Smoke-tested end-to-end.

- **M6 — Billing & documents**: pure pricing engine (wastage-inclusive
  metal value, FLAT/PER_GRAM/PERCENT making, discount floor; 6 tests) +
  pure GST engine (itemized 3%+5%, studded composite 3%, imitation 18%,
  CGST/SGST vs IGST, mixed-supply §8(b) guard, old-gold value-addition,
  kaccha zero-tax, TaxConfigError on matrix gaps; 12 tests). Document
  engine: one cart → INV/EST/DC, row-locked NumberSeries, snapshot-frozen
  lines, SALE_OUT + SOLD on invoice, estimate→invoice conversion with
  linkage (quote honoured, not repriced), cancel with stock reversal —
  all single-tx with audit rows. Smoke-tested: est→convert→cancel,
  studded+exchange (tax on addition only), inter-state IGST.

- **M7 — Web admin**: Next.js 15 App Router + Tailwind v4. Login (JWT),
  guarded sidebar shell, dashboard (board rates + stock position),
  masters (rate fix, customers, tax matrix), inventory (create item,
  ledger), tagging (tags, barcode preview, printable label sheets),
  billing (cart → any doc type, old-gold input, detail with tax lines,
  convert/cancel). `next build` clean; verified in headless Chromium
  (login → dashboard → billing → masters, zero page errors).

- **M8 — Mobile (Expo)**: thin online-only client, dependency-light
  (no nav lib; local index.ts entry for pnpm compat). Screens: login,
  board rates (pull-to-refresh), stock lookup with LIVE price at today's
  rate via new `/items/:id/price` endpoint (the price-free-barcode story),
  estimate creation at the counter. Verified: `tsc --noEmit` + full
  `expo export` Metro→Hermes bundle.

- **M9 — REPORT.md**: final report (scope, decisions, run instructions,
  79-test coverage table, known gaps), root README, architecture refresh.
  Full workspace verification: builds, tests, typechecks all green.

- **Post-MVP: mobile manager view** — the mobile app now has TWO
  role-based views (role from login decides): manager view
  (`screens/manager/`: Dashboard = rates + stock position + recent docs,
  Stock = create item / adjustment / receive transfers, Billing = full
  document engine incl. convert & cancel, Rates) and the sales counter
  view (`screens/sales/`: Rates, scan-to-price Lookup, Estimate). Shared
  screens in `screens/common/`, client in `lib/` — folders strictly
  separated, no cross-view imports. RBAC stays server-side (verified:
  manager can post adjustments, salesperson gets 403). Root README
  rewritten as a step-by-step "run everything" guide.

- **Post-MVP: paper bills, customer history view, org signup, camera
  scanning** — (1) new `paper-bills` API module: multipart upload
  (JPEG/PNG/WebP/PDF ≤10 MB) filed against a customer, tenant-scoped
  file streaming, append-only + audited; (2) web **Customers** page:
  pick a customer → ALL their system documents + ALL uploaded paper
  bills side by side (the recurring-customer multi-bill view), with
  upload + in-browser viewing; (3) web **/register** page — create any
  number of isolated organisations (tenants) with auto-login; (4) mobile
  camera barcode scanning (expo-camera, Code128 + DataMatrix) via a
  shared ScanButton on every item-code field in both views, plus
  customer bill history in manager Billing. Verified: multipart upload/
  stream/type-reject smoke, second-org registration, headless-Chromium
  customers page, mobile tsc + expo export.

- **Post-MVP: paper-bill OCR + manager reports** — (1) `POST
  /paper-bills/:id/extract`: tesseract.js OCR (fully offline via
  npm-packaged tessdata) + pure `parse-bill-text` domain parser (7 tests)
  extracting bill no / date / amounts+total / weights / per-10g rate /
  phones; stored on the row, audited, surfaced in the web Customers page
  as a reviewed draft for keying in online bills. (2) `modules/reports`:
  documents.csv (per-bill register with CGST/SGST/IGST split) and
  gst-summary.csv (per-bucket totals over issued tax invoices),
  MANAGER/ACCOUNTANT-only, with date-range download buttons on the web
  Billing page. E2E-verified: photo → OCR fields (bill 1247, ₹44,500) in
  the browser, CSV download, salesperson 403.

- **Post-MVP: web admin design system** — typography (Inter Variable for
  UI/figures, Fraunces Variable reserved for brand + display headings;
  both bundled from npm, no font CDN), a gold/stone token palette in
  Tailwind v4 `@theme`, refined component layer (gradient buttons, soft
  cards, focus rings, table hover, `.num` tabular columns), reserved
  status badges (always labelled, mapped per domain status), stat tiles
  per dataviz guidance (sans semibold values, proportional figures),
  dark espresso sidebar with lucide icons + active gold indicator +
  user chip, branded auth screens, shared `components/ui.tsx`
  (PageHeader/Badge/StatTile/EmptyState) applied across all six pages.
  Fixed the workspace dual-@types/react skew via tsconfig path pins.
  Mobile accent aligned to the same gold. Verified in Chromium
  (screenshots, zero page errors); all tests/typechecks green.

- **Post-MVP: mobile design system** — the Expo app now matches the web
  brand: Inter + Fraunces via expo-font (npm-bundled, offline), gold/
  espresso theme tokens (`lib/theme.ts`), a component kit (`components/
  kit.tsx`: Btn variants, Card, labelled Badge with per-status tones,
  ScreenHeader, StatTile, Field, Notice), espresso icon tab bar
  (lucide-react-native + react-native-svg), gradient-branded login,
  and all seven screens restyled (gold price/total highlight cards,
  premium chips, soft shadows). Verified: tsc + expo export with all
  36 font/icon assets bundled.

## In progress

Nothing — **the MVP scope is complete and pushed.**

## Resume point

MVP done (plus post-MVP additions above: mobile manager view, paper
bills with OCR, customer history view, org signup UI, camera scanning,
manager CSV reports). Natural next steps if development continues (see
REPORT.md “Known gaps”): credit-note document type + supersede endpoint,
old-gold scrap intake lot, metal-rate feed poller, PDF invoice
rendering, PDF rasterizing for OCR, CI pipeline, e2e test harness,
mobile secure token storage, offline sync.
