# ARCHITECTURE — Jewellery & Gems ERP SaaS

A multi-tenant SaaS ERP for Indian jewellery & gems retail. This document is
the living map of the system; it is updated as each milestone lands.

## 1. Monorepo layout

```
/
├── packages/
│   └── shared/          TS types, enums, zod schemas, money/weight math
│                        (consumed by api, web, mobile)
├── apps/
│   ├── api/             NestJS REST API + Prisma + PostgreSQL
│   │   └── src/
│   │       ├── domain/  PURE business logic (no NestJS imports): tax
│   │       │            resolution, GST engine, pricing, weight/purity
│   │       │            math, making charges, old-gold valuation
│   │       ├── platform/ tenancy, auth, RBAC, audit log, prisma
│   │       └── modules/ HTTP modules (master-data, inventory, tagging,
│   │                    billing) — thin controllers over domain + prisma
│   ├── web/             Next.js App Router admin (TailwindCSS)
│   └── mobile/          Expo React Native thin client (online-only)
├── PLAN.md              milestone plan
├── PROGRESS.md          live progress + resume point
└── ARCHITECTURE.md      this file
```

Dependency direction: `apps/* → packages/shared`. `apps/api/src/domain` is
framework-free and depends only on `shared`; NestJS modules depend on domain,
never the reverse.

## 2. Core architectural decisions

### 2.1 Identifiers
Every primary key is an **application-generated UUIDv4** (`uuid` package,
generated in the service layer before insert). No DB sequences for entity
identity. Rationale: future offline mobile sync — a device can mint IDs
without a round-trip and later push records without renumbering.
Human-facing document numbers (e.g. `INV-2026-000123`) are a *separate*
per-tenant, per-series counter column — display concern, not identity.

### 2.2 Money & weights
- Money is stored and computed as **integer paise** (`Int`/`BigInt` in
  Prisma, `number`/`bigint` in TS via `shared/money`). ₹1 = 100 paise.
  Division (tax splits, proration) uses explicit rounding rules
  (half-up per line, remainder to last allocation) so totals always
  reconcile to the paise.
- Weights are **fixed-precision decimals**: grams carried to 3 dp
  (integer milligrams internally), carats to 2 dp (integer cents),
  ratti derived (1 ratti = 0.182 g convention, configurable). Stored as
  Prisma `Decimal`, transported as strings, computed with the
  `shared/weight` integer utilities. No floats anywhere in the money or
  weight paths.

### 2.3 Immutability of financial documents
Invoices, estimates, challans, stock movements and exchange records are
**append-only**. Corrections happen by:
- **supersede**: issue a new document version pointing at the old via
  `supersedesId`; old one gets status `SUPERSEDED`.
- **reverse**: issue a reversing document (e.g. credit note / reverse
  movement) pointing at the original.
Every financial mutation also writes an **AuditLog** row (actor, tenant,
entity, action, before/after JSON snapshot).

### 2.4 Multi-tenancy
Shared tables with a `tenantId` column on every tenant-scoped entity.
Enforcement lives in one place: a **tenant-scoped Prisma client**
(Prisma `$extends` query extension) that injects `tenantId` into every
`where`/`create` for models on the tenant-scoped list, so a query that
forgets the filter *cannot* leak across tenants. Controllers obtain the
scoped client from the request context (tenant resolved from the JWT).

### 2.5 Domain purity
`apps/api/src/domain/**` contains pure functions/classes: inputs in,
outputs out, no I/O, no NestJS, no Prisma. Unit tests live beside them.
NestJS services orchestrate: load rows → call domain → persist results.

## 3. Data model (summary — see `apps/api/prisma/schema.prisma`)

- **Platform**: Tenant, Branch, User, UserRole (owner/manager/salesperson/
  accountant), AuditLog.
- **Master data**: Metal, Purity (karat/fineness), StoneType,
  HsnCode, TaxRule (the configurable matrix), Customer (+KYC),
  Supplier, Karigar, MetalRate (feed + manual fix).
- **Inventory**: Item (composite), ItemMetalComponent, ItemStoneComponent
  (4Cs / carat / ratti / certificate), Lot, StockMovement (append-only),
  BranchTransfer.
- **Tagging**: Tag (per piece; barcode payload = stable `itemCode`, never
  price), LabelTemplate, LabelBatch.
- **Billing**: Document (one table, `docType` = TAX_INVOICE | ESTIMATE |
  DELIVERY_CHALLAN), DocumentLine, DocumentTaxLine, OldGoldExchange,
  DocumentLink (estimate→invoice conversion linkage), NumberSeries.

## 4. Tax engine (domain)

`resolveTaxRule(matrix, key)` resolves a GST rate from
`(componentType, form, isSetInJewellery, invoiceMode)` against the
tenant-configurable TaxRule matrix (seeded with the 2026 India facts —
see PLAN.md). The GST computation engine then:
- taxes metal value at the metal rate (3%) and *itemized* making charges
  at 5% as separate lines;
- collapses studded jewellery to a composite 3% on full item value
  (stone set in jewellery);
- picks CGST+SGST vs IGST by comparing supplier vs place-of-supply state
  codes;
- guards mixed supplies (different rates on one invoice stay separate
  lines; a bundle priced as one collapses to the highest rate — the
  mixed-supply rule of CGST Act §8(b));
- for old-gold exchange, charges GST only on the value addition
  (new item value minus exchange value), per the used-goods margin
  scheme analogy adopted for jewellery exchanges.

## 5. API surface

REST under `/api/v1/*`, documented via Swagger at `/api/docs`.
Auth: `POST /auth/login` → JWT (claims: `sub`, `tenantId`, `role`).
RBAC guard maps roles to permissions per route. All list endpoints are
tenant-scoped implicitly.

## 6. Web & mobile

Web admin (Next.js App Router) talks to the API with the shared zod
schemas for form validation; screens per module. Mobile (Expo) is a thin
online-only client: login, stock lookup by tag/barcode scan, live metal
rates, estimate creation. No local database in MVP; UUID-everywhere and
append-only documents keep the door open for offline sync later.
