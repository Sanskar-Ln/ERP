# PROGRESS

Live status of the MVP build. Updated at every milestone. See PLAN.md for
the full milestone list and ARCHITECTURE.md for the system map.

## Done

- **M0 — Monorepo scaffold** (this commit): pnpm workspace (`packages/*`,
  `apps/*`), base tsconfig, .gitignore, PLAN.md, PROGRESS.md,
  ARCHITECTURE.md. Local dev PostgreSQL 16 (`erp`/`erp`, db `erp`).

## In progress

- M1 — `packages/shared`.

## Resume point

Start M1: build `packages/shared` (enums, zod schemas, money/weight
fixed-point utilities + unit tests), then M2 API platform per PLAN.md.
