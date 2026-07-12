# REPORT — Jewellery & Gems ERP SaaS (MVP)

Final summary of the MVP build. See PLAN.md (milestones), ARCHITECTURE.md
(system map), PROGRESS.md (build log), and per-module READMEs for depth.

## What was built

A multi-tenant SaaS ERP for Indian jewellery & gems retailers, as a pnpm
monorepo with four packages:

| Package | Stack | Contents |
|---------|-------|----------|
| `packages/shared` | TS + zod | enums, DTO schemas, integer-paise money math, fixed-point weight/purity math (mg / millicarat / ratti / fineness / wastage) |
| `apps/api` | NestJS + Prisma + PostgreSQL | the entire backend (below) |
| `apps/web` | Next.js 15 + Tailwind v4 | admin: dashboard, masters, inventory, tagging, billing |
| `apps/mobile` | Expo RN | thin online-only client: login, rates, scan-to-price stock lookup, counter estimates |

### Backend scope (apps/api)

- **Platform**: multi-tenancy (tenant-scoped Prisma client — every query
  rewritten centrally, unit-tested), JWT auth, RBAC (owner / manager /
  salesperson / accountant; owner passes all checks), append-only audit
  log written inside mutation transactions, zod validation with
  zod→OpenAPI Swagger docs at `/api/docs`.
- **Master data**: metals & purities (karat + fineness ppt), stone types
  (diamond 4Cs, carat/ratti, IGI/GIA/SGL certificates), HSN codes,
  **configurable tax-rule matrix** keyed by (componentType, form,
  isSetInJewellery, invoiceMode) with effective dating (2026 India rates
  are seed DATA: 3% jewellery 7113, 3% silver 7106/gold 7108, 5% making
  9988, 0.25% rough / 1.5% polished diamonds 7102, 18% imitation 7117),
  customers with KYC docs, suppliers, karigars, append-only metal-rate
  board (feed + audited manual fix, ₹/10 g).
- **Inventory**: composite items (metal component(s) + stone component(s)
  + making rule), dual-unit tracking (signed pieces AND grams on every
  ledger row), lots, append-only stock movements with once-only REVERSAL,
  inter-branch transfers (TRANSFER_OUT/IN pair, IN_TRANSIT state), stock
  summary.
- **Tagging**: per-piece tags `ITEMCODE#ordinal`; **barcode payload never
  contains price** (triple-enforced), so daily repricing never reprints;
  server-side bwip-js rendering (Code128 default, DataMatrix option);
  label templates (mm layout + field list); batch printable HTML sheets;
  `/items/:id/price` computes the live price at scan time.
- **Billing**: one cart → Tax Invoice / Estimate / Delivery Challan.
  GST engine (pure): itemized 3% metal + 5% making, studded composite 3%,
  imitation 18%, CGST/SGST vs IGST by state pair with paise-exact halving,
  mixed-supply guard (§8(b): bundles tax at the highest rate), old-gold
  exchange taxed on the **value addition only**, kaccha documents carry
  zero GST, missing matrix rules throw (never a silent 0%). Row-locked
  per-series numbering (INV-2026-000001). Estimate→invoice conversion
  honours the quote, links both ways, posts stock effects. Cancellation
  preserves the document and reverses stock.

## Architecture decisions (and why)

1. **App-generated UUIDv4 PKs** — future offline clients can mint ids;
   no DB identity anywhere. Display numbers are separate per-tenant
   counters (GST consecutive-numbering rule).
2. **Integer paise / fixed-point weights** — no IEEE floats in any money
   or weight path; bps rates keep 0.25% exact; largest-remainder
   allocation and CGST/SGST halving reconcile to the paise by
   construction (tested).
3. **Append-only financial records** — documents/movements/exchanges are
   corrected by successor rows (REVERSAL, supersede/convert links), with
   an AuditLog row in the same transaction. Line `snapshot` JSON freezes
   every pricing input at issue time.
4. **Tenancy enforced in one place** — a Prisma `$extends` rewriter
   (`scopeArgs`, pure + unit-tested) AND-filters reads, stamps creates,
   and strips cross-tenant updates. Feature code cannot leak tenants by
   forgetting a filter.
5. **Pure domain modules** — tax resolution, GST computation, pricing,
   weight math, movement rules, tag codes are framework-free functions
   under `apps/api/src/domain/**`, tested without any I/O.
6. **Tax rates are tenant data** — the matrix resolves rates; code never
   hardcodes them. A Budget rate change is a new effective-dated row.

## How to run

```sh
# prerequisites: Node ≥20, pnpm 10, PostgreSQL 16
pnpm install

# 1) database + API (port 3001; Swagger at /api/docs)
createdb erp && psql -c "CREATE USER erp WITH PASSWORD 'erp'"   # or reuse yours
cd apps/api && cp .env.example .env                              # set DATABASE_URL, JWT_SECRET
pnpm prisma:migrate && pnpm seed                                 # schema + demo tenant
pnpm dev

# 2) web admin (port 3000)
pnpm --filter @erp/web dev
#    login: owner@demo.in / demo1234  (manager@ / sales@ / accounts@ too)

# 3) mobile (Expo Go; set expo.extra.apiUrl to your LAN address first)
pnpm --filter @erp/mobile start

# tests / checks
pnpm -r test && pnpm -r typecheck && pnpm -r run build
```

## Test coverage

79 unit tests, all green, focused on the money-bearing logic:

| Area | Tests |
|------|-------|
| shared money math (bps, halving, allocation, formats) | 19 |
| shared weight math (mg/mct/ratti, fineness, wastage, valuation) | 19 |
| tenancy guard (`scopeArgs`) | 9 |
| tax-rule resolution (effective dating, overlaps) | 5 |
| pricing (wastage, making rules, discount floor, old gold) | 6 |
| GST engine (all 7 rules + reconciliation) | 12 |
| movement rules (signs, reversal, float guard) | 5 |
| tag codes (round-trip, price-free assertion) | 4 |

Every milestone was additionally smoke-tested end-to-end against local
PostgreSQL (register→login→RBAC, item→adjust→reverse→transfer→receive,
tag→barcode→label sheet, estimate→convert→cancel, studded+exchange,
inter-state IGST), and the web admin was driven in headless Chromium.

## Known gaps (deliberate MVP cuts)

- Old gold received is recorded on the document but not booked into a
  scrap inventory lot (no melt/refine flow yet).
- Cancellation reverses stock but there is no formal GST **credit note**
  document type; supersede (`supersedesId`) is modelled but has no
  endpoint yet.
- Delivery challans carry no stock effect (accompany-goods use case).
- No external metal-rate feed integration — `source: FEED` rows are
  accepted via the same endpoint; a poller is future work.
- No printable PDF invoice (web renders totals; label sheets are HTML).
- Mobile keeps the JWT in memory only; offline sync is design-ready
  (UUIDs, append-only) but not implemented. Camera barcode scanning
  (Code128/DataMatrix via expo-camera) IS implemented alongside
  keyboard-wedge scanners.
- Uploaded paper bills are stored and viewable but not OCR-parsed —
  their contents are not extracted into structured data.
- No e2e/integration test harness (unit + scripted smoke only); no CI
  pipeline config in-repo.
- Single warehouse per branch; no per-karigar metal reconciliation
  statement yet (issue/receipt movements exist).
