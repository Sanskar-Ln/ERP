# @erp/shared

The single source of truth shared by the API (`apps/api`), web admin
(`apps/web`) and mobile app (`apps/mobile`). No framework code lives here —
only types, enums, zod schemas and pure fixed-point math.

## Responsibilities

| File | Responsibility |
|------|----------------|
| `src/enums.ts` | Domain enums (roles, component types, material forms, document types/statuses, movement types, symbologies, …) as string-literal unions |
| `src/ids.ts` | Application-generated UUIDv4 ids (`newId`) — the system-wide identity rule |
| `src/money.ts` | Integer-paise money math: bps rates, CGST/SGST halving, largest-remainder allocation, Indian formatting |
| `src/weight.ts` | Fixed-point weight/purity math: mg/millicarat/ratti conversions, net/fine/wastage rules, metal valuation |
| `src/schemas/` | zod request/response schemas per module (auth, master-data, inventory, tagging, billing) — used for API validation and web/mobile form validation |

## Representation rules (system-wide)

- **Money**: integer paise (JSON numbers). Rates in basis points.
- **Weights**: strings on the wire — grams to 3 dp, carats to 3 dp,
  ratti to 2 dp; integers (mg / millicarat) in computation.
- **Ids**: UUIDv4, minted in the application (`newId()`), never DB serial.

## Commands

```sh
pnpm --filter @erp/shared test    # vitest unit tests
pnpm --filter @erp/shared build   # tsc → dist/
```
