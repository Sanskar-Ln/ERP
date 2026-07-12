# @erp/web

Next.js (App Router) web admin for the jewellery ERP. TailwindCSS v4,
client-side JWT auth against the API (`NEXT_PUBLIC_API_URL`, default
`http://localhost:3001/api/v1`).

## Pages

| Route | What it does |
|-------|--------------|
| `/login` | JWT login (demo: owner@demo.in / demo1234) |
| `/dashboard` | live board rates per purity + dual-unit stock position |
| `/masters` | metals & purities, manual rate fix, customer create/search, tax-rule matrix |
| `/inventory` | item list, create item (single metal component form), per-item movement ledger |
| `/tagging` | create per-piece tags, barcode preview, label batches → printable sheet (blob-opened, JWT-fetched) |
| `/billing` | cart builder → Tax Invoice / Estimate / Challan, old-gold exchange input, document list/detail with tax lines, convert & cancel |

## Structure

- `src/lib/api.ts` — fetch wrapper (JWT header, ApiError, 401 → /login),
  `inr()` paise formatter (money is integer paise everywhere).
- `src/app/(app)/layout.tsx` — auth guard + sidebar shell.
- Forms mirror the API's zod contracts from `@erp/shared` (weights as
  3-dp gram strings, money as paise, rates as ₹/10 g converted to paise
  at the boundary).

## Run

```sh
pnpm --filter @erp/web dev     # port 3000 (API must run on 3001)
pnpm --filter @erp/web build
```
