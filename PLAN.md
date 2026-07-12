# PLAN — Jewellery & Gems ERP SaaS (MVP)

Multi-tenant SaaS ERP for Indian jewellery & gems retailers.
Monorepo: NestJS API + Next.js web admin + Expo mobile + shared package.

## Fixed stack

| Layer      | Choice                                                     |
|------------|------------------------------------------------------------|
| Backend    | NestJS (TypeScript), PostgreSQL, Prisma ORM                |
| Web admin  | Next.js App Router (TypeScript), TailwindCSS               |
| Mobile     | React Native (Expo, TypeScript), thin client, online-only  |
| Shared     | `packages/shared` — TS types + zod schemas                 |
| API        | REST, OpenAPI/Swagger                                      |
| Workspace  | pnpm workspaces                                            |

## Non-negotiable architecture rules

1. **UUIDv4 primary keys, application-generated** — never DB auto-increment
   (enables future offline sync; clients can mint IDs).
2. **Financial documents are append-only/immutable** — invoices, stock
   movements, exchanges are never edited in place; they are superseded or
   reversed by new documents. Full audit log on every financial mutation.
3. **Money = integer paise** (INR minor unit). **Weights = fixed-precision
   decimals carried as strings** (grams to 3 dp = milligram; carats to 2 dp =
   cent). Never IEEE floats for money or weight.
4. **Pure domain modules** — tax resolution, pricing, weight/purity math,
   making-charge rules, old-gold valuation live in framework-free TypeScript
   modules with unit tests, imported by NestJS controllers/services.
5. **Multi-tenancy** — shared tables, `tenantId` column on every tenant-scoped
   entity, enforced by a tenant-scoped Prisma query layer so no query can leak
   across tenants.

## Milestones (in order; commit + push after each)

- [x] **M0 — Monorepo scaffold** + PLAN.md / PROGRESS.md / ARCHITECTURE.md.
- [x] **M1 — `packages/shared`**: enums, zod schemas, money (paise) &
      weight (mg / carat-cent) fixed-point utilities, with unit tests.
- [x] **M2 — API platform**: NestJS app, Prisma schema + migrations,
      tenant-scoped query layer, JWT auth, RBAC (owner/manager/salesperson/
      accountant), audit log, Swagger.
- [x] **M3 — Master data**: metals & purities, stone types (4Cs, carat/ratti,
      certificates IGI/GIA/SGL), HSN codes, configurable tax-rule matrix,
      customers + KYC, suppliers, karigars, metal-rate feed with manual fix.
- [x] **M4 — Inventory**: composite items (metal + stone + making
      components), dual-unit tracking (pieces + gross/net/stone weight +
      wastage), lots, append-only stock movements, inter-branch transfer.
- [x] **M5 — Tagging & barcode**: per-piece tags (barcode encodes stable item
      code only — repricing never reprints), label templates, batch label
      generation, server-side barcode via bwip-js (Code128 default,
      DataMatrix option).
- [x] **M6 — Billing & documents**: document-type engine (Tax Invoice /
      Estimate / Delivery Challan from one cart), Estimate→Tax Invoice
      conversion with linkage + audit, GST engine (3% metal, 5% making
      itemized, composite 3% studded, CGST/SGST vs IGST, mixed-supply guard),
      old-gold exchange with GST on value addition only.
- [x] **M7 — Web admin** (Next.js): auth, master data, inventory, tagging,
      billing screens.
- [x] **M8 — Mobile** (Expo): thin online-only client — login, catalogue/stock
      lookup, rate view, estimate creation.
- [x] **M9 — REPORT.md**: final summary, run instructions, coverage, gaps.

## Tax facts encoded as *seed data* for the configurable tax-rule matrix
(India, 2026 — configurable per tenant, not hardcoded)

| Supply                                   | HSN  | GST    |
|------------------------------------------|------|--------|
| Gold / silver / diamond jewellery        | 7113 | 3%     |
| Silver (metal)                           | 7106 | 3%     |
| Making charges (itemized on invoice)     | 9988 | 5%     |
| Loose diamonds — rough                   | 7102 | 0.25%  |
| Loose diamonds — cut & polished          | 7102 | 1.5%   |
| Imitation jewellery                      | 7117 | 18%    |

Resolution key: `(componentType, form, isSetInJewellery, invoiceMode)` →
rate + HSN. Studded (stone set in jewellery) collapses to composite 3% on the
whole item value; making charges taxed at 5% only when itemized on a Tax
Invoice; Estimate/kaccha documents carry no GST.

## Working method

Module = milestone. Definition of done: compiles, tests pass, JSDoc/TSDoc +
README written, committed and pushed, PROGRESS.md updated. Never leave the
tree broken; every session ends on a pushed, compiling state with a resume
point recorded in PROGRESS.md.
