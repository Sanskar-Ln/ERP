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

## In progress

- M3 — Master data module.

## Resume point

Build `apps/api/src/modules/master-data`: CRUD for metals/purities,
stone types, HSN codes, tax-rule matrix (+ resolver seed data), customers
(KYC), suppliers, karigars, metal rates (feed + manual fix, latest-rate
endpoint). Then prisma/seed.ts with the 2026 India tax defaults.
