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

## In progress

- M6 — Billing & documents.

## Resume point

Build domain pricing + GST engine (pure, heavily tested):
`domain/pricing/price-item.ts` (metal value via rate+wastage, stones,
making charge rules, discounts), `domain/billing/gst-engine.ts`
(itemized 3%+5% vs studded composite 3%, CGST/SGST vs IGST, mixed-supply
guard, old-gold value-addition rule), then `modules/billing` document
engine: one cart → TAX_INVOICE/ESTIMATE/DELIVERY_CHALLAN, NumberSeries,
SALE_OUT/EXCHANGE_IN movements, estimate→invoice conversion, cancel with
reversal — all in one tx with audit rows.
