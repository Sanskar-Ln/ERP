# inventory module

Composite items, lots, the append-only stock ledger, and inter-branch
transfers. Pure movement math lives in `domain/inventory/movement-rules.ts`.

| File | Endpoints | Notes |
|------|-----------|-------|
| `items.ts` | `/items` (+`/by-code/:itemCode` scanner lookup), `/lots` | item = metal + stone components + making rule; creation tx = item + components + PURCHASE_IN + audit |
| `movements.ts` | `/stock-movements`, `/stock-movements/:id/reverse` | append-only; direct posting limited to PURCHASE_IN / ADJUSTMENT / KARIGAR_*; reversal = negated REVERSAL row, once per movement |
| `transfers.ts` | `/transfers`, `/transfers/:id/receive` | TRANSFER_OUT at dispatch (item IN_TRANSIT) + TRANSFER_IN at receipt (item re-homed) |
| `inventory.module.ts` | `/stock/summary` | dual-unit position: pieces by branch/status + total gross/net grams |

## Business rules encoded here

- **Dual-unit tracking**: every ledger row carries signed pieces AND
  signed gross weight (grams, 3 dp). Counting reconciles pieces;
  valuation reconciles grams. Signs are forced by movement type
  (`signedQuantities`) so a caller cannot post a sale as an inflow.
- **Append-only ledger**: no update/delete on movements. Corrections are
  REVERSAL rows (exact negation, linked via `reversesId`, unique — a
  movement reverses at most once). Item creation and its opening
  movement are one transaction.
- **Transfers are two events**: stock is always at exactly one branch or
  explicitly IN_TRANSIT; an un-received TRANSFER_OUT is visible shrinkage.
- **SALE_OUT / EXCHANGE_IN / TRANSFER_* movements** cannot be posted
  directly — only their owning flows (billing, transfers) create them.
