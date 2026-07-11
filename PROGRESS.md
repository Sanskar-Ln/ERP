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

## In progress

- M5 — Tagging & barcode.

## Resume point

Build `apps/api/src/modules/tagging`: Tag creation per piece (tagCode =
itemCode#ordinal), label templates CRUD, batch label generation rendering
barcodes server-side with bwip-js (Code128 default, DataMatrix option),
PNG per tag + printable HTML sheet. Barcode payload = itemCode ONLY.
