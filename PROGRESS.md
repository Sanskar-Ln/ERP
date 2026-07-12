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

## In progress

- M7 — Web admin (Next.js).

## Resume point

Scaffold `apps/web`: Next.js App Router + Tailwind, login page (JWT in
localStorage + fetch wrapper), sidebar layout, pages: dashboard (rates,
stock summary), masters (metals/purities, tax rules, customers), inventory
(items list/create, movements, transfers), tagging (tags, label batches →
open render HTML), billing (cart → issue any doc type, documents list,
detail with tax lines, convert/cancel buttons). Uses @erp/shared zod
schemas for forms. Then M8 mobile.
