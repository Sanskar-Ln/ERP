# master-data module

Reference data everything else prices against. All endpoints tenant-scoped
via `TenancyService`; reads open to all roles, writes per-route RBAC.

| File | Endpoints | Notes |
|------|-----------|-------|
| `catalog.ts` | `/metals`, `/purities`, `/stone-types`, `/hsn-codes` | create-only masters (rows get referenced by immutable documents) |
| `tax-rules.ts` | `/tax-rules`, `/tax-rules/resolve` | the configurable GST matrix; resolution logic is pure domain (`domain/tax/resolve-tax-rule.ts`); rule creation is audited |
| `parties.ts` | `/customers` (+KYC docs), `/suppliers`, `/karigars` | customer search for the counter flow |
| `rates.ts` | `/metal-rates`, `/metal-rates/latest` | append-only rate board; `MANUAL_FIX` rows are audited; exports `latestRate()` reused by billing |

## Business rules encoded here

- **Tax matrix is data**: GST rates live in `TaxRule` rows keyed by
  `(componentType, form, isSetInJewellery, invoiceMode)` with effective
  dating. The 2026 India defaults are seeded by `prisma/seed.ts`; a rate
  change is a new row, never an edit.
- **Rate board**: invoices price against the latest `effectiveAt ≤ now`
  row per (metal, purity), paise per 10 g. Manual fixes are the
  jeweller's board rate and take precedence purely by being newer.
- **Purity**: `finenessPpt` (916/750/925) is authoritative; karat labels
  are display only.
