# @erp/api

NestJS REST API for the jewellery ERP. PostgreSQL via Prisma. Swagger at
`/api/docs`, all routes under `/api/v1`.

## Layout

```
prisma/schema.prisma   full data model (UUID PKs, BigInt paise, Decimal weights)
src/
├── platform/          cross-cutting infrastructure
│   ├── prisma/        raw PrismaClient (login & provisioning only)
│   ├── tenancy/       THE multi-tenancy guard: scopeArgs() + TenancyService
│   ├── auth/          JWT issue/verify, @Public/@Roles/@CurrentUser, RBAC guard
│   ├── audit/         append-only AuditLog writer (used inside mutations' txs)
│   └── validation/    ZodPipe (shared-schema validation) + zod→OpenAPI helpers
├── domain/            PURE business logic (no NestJS/Prisma imports) + tests
└── modules/           feature modules: master-data, inventory, tagging, billing
```

## Key invariants (enforced here)

- **Tenancy**: modules never touch `PrismaService` directly; they ask
  `TenancyService.client(tenantId)` for a scoped client. The extension
  rewrites every query (`tenant-scope.ts`, unit-tested) — filters AND-ed
  into reads, `tenantId` stamped into creates, cross-tenant updates
  stripped. A forgotten filter cannot leak data.
- **Identity**: services mint `newId()` (UUIDv4) for every row. The DB has
  no identity defaults on purpose.
- **Money/weights**: BigInt paise and Decimal grams/carats in the DB;
  JSON serializes BigInt→number with a safe-range guard (main.ts).
- **Immutability**: financial rows are never updated in place; status
  transitions + successor rows only, always with an AuditLog row in the
  same transaction.

## Run

```sh
cp .env.example .env             # set DATABASE_URL, JWT_SECRET
pnpm prisma:migrate              # apply migrations (dev)
pnpm seed                        # seed demo tenant + masters (see prisma/seed.ts)
pnpm dev                         # tsx watch src/main.ts  (port 3001)
pnpm test                        # vitest unit tests (domain + platform)
```

## Auth flow

`POST /auth/register` (public SaaS signup) → tenant + HQ branch + ADMIN →
`POST /auth/login` → `{ accessToken }` → `Authorization: Bearer …`.
Claims: `sub`, `tenantId`, `role`, `branchId`. RBAC: two roles — ADMIN
(bypasses every `@Roles` check) and OPS (day-to-day writes only).
