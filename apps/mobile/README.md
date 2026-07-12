# @erp/mobile

Expo (React Native, TypeScript) thin client — **online-only** for the MVP,
with **two role-based views**. No local database; every screen talks
straight to the API. The API enforces RBAC server-side, so the view split
is UX, not security.

## The two views

Which view mounts is decided by the role in the login response.

### Manager view (role OWNER or MANAGER) — `src/screens/manager/`

| Tab | Flow |
|-----|------|
| Dashboard | board rates + dual-unit stock position + recent documents (same picture as the web dashboard) |
| Stock | item list, **create item**, post **stock adjustment** (append-only ledger), **receive incoming branch transfers** |
| Billing | full document engine: cart (customer + item codes) → **Tax Invoice / Estimate / Challan**, document list & detail with tax lines, **convert estimate → invoice**, **cancel** (stock reversed) |
| Rates | live board rates |

### Sales (counter) view (role SALESPERSON or ACCOUNTANT) — `src/screens/sales/`

| Tab | Flow |
|-----|------|
| Rates | live board rates, pull-to-refresh |
| Stock | scan/enter an item or tag code → item details + **live price at today's rate** (`/items/:id/price`) — possible because tags never encode price |
| Estimate | find customer by phone, add items by code, issue a kaccha Estimate |

## Folder layout (kept strictly separated)

```
App.tsx                     role-based view switcher + tab bar (no nav lib)
index.ts                    Expo entry (pnpm-safe registerRootComponent)
src/
├── lib/
│   └── api.ts              fetch wrapper, session (token+user+role), inr(), ui tokens
└── screens/
    ├── common/             used by BOTH views: LoginScreen, RatesScreen
    ├── manager/            manager view only: DashboardScreen, StockScreen, BillingScreen
    └── sales/              counter view only: LookupScreen, EstimateScreen
```

Manager screens never import from `sales/` and vice versa; anything both
need lives in `common/` or `lib/`.

## Run

```sh
pnpm --filter @erp/mobile start     # Expo dev server (Expo Go on device)
pnpm --filter @erp/mobile typecheck
```

Demo logins (password `demo1234`): `manager@demo.in` or `owner@demo.in`
→ manager view · `sales@demo.in` → counter view.

For a physical device, set `expo.extra.apiUrl` in `app.json` to the API
machine's LAN address (e.g. `http://192.168.1.10:3001/api/v1`) — a device
cannot reach the host's `localhost`. Verified CI-style: `tsc --noEmit` +
`expo export` (Metro → Hermes bytecode) both pass.
