# billing module

The document engine. One cart shape (`zCart`) → Tax Invoice (full GST) /
Estimate (kaccha, no GST) / Delivery Challan. Pure math lives in
`domain/pricing/price-item.ts` and `domain/billing/gst-engine.ts`; this
module only orchestrates I/O around them.

| File | Responsibility |
|------|----------------|
| `documents.service.ts` | issue / convertEstimate / cancel — each a single tenant-scoped transaction (document graph + stock effects + audit) |
| `number-series.ts` | per-tenant, per-series display numbering (INV-2026-000001), row-locked increment inside the issue tx |
| `billing.controller.ts` | `/documents` REST surface |

## Flows

- **Issue**: load customer/branch/items/rates/matrix → price lines (pure)
  → value old gold (pure) → prorate cart discount (largest-remainder) →
  GST engine (pure) → create Document+lines+taxLines+exchanges → if Tax
  Invoice: SALE_OUT movements + items SOLD → audit ISSUE.
- **Convert** (estimate → invoice): quote honoured — line values come from
  the estimate's frozen lines, NOT repriced; GST recomputed in invoice
  mode; items must still be available; invoice carries `convertedFromId`,
  estimate flips to CONVERTED; stock effects post now; audit CONVERT.
- **Cancel**: document preserved verbatim, status → CANCELLED; a Tax
  Invoice's SALE_OUT rows are reversed (REVERSAL movements) and items
  return to stock; audit CANCEL.

## GST rules (see gst-engine.ts for full commentary)

itemized 3% metal + 5% making (plain), composite 3% studded, 18%
imitation, CGST/SGST vs IGST by state pair, mixed-supply guard
(§8(b) — bundle taxes at highest rate), old-gold exchange taxed on value
addition only, estimates/challans carry no GST. All rates resolved from
the tenant's TaxRule matrix — a missing rule throws TaxConfigError,
never a silent 0%.

## Immutability guarantees

Documents have no update endpoint. Line `snapshot` JSON freezes every
pricing input (weights, rates, wastage, making rule, stones) at issue
time. Status transitions never touch financial columns. Every mutation
writes an AuditLog row in the same transaction.

## Known MVP simplifications

- Old gold received is recorded on the document (OldGoldExchange rows)
  but not yet booked into a scrap inventory lot.
- Cancellation reverses stock and marks CANCELLED; a formal GST credit
  note document type is future work.
- Delivery challans carry no stock effect (accompany-goods use case).
