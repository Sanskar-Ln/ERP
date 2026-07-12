# @erp/mobile

Expo (React Native, TypeScript) thin client — **online-only** for the MVP.
No local database; every screen talks straight to the API. UUIDs-everywhere
and the append-only document model keep the path open for offline sync
later (see ARCHITECTURE.md §2.1).

## Screens

| Screen | Flow |
|--------|------|
| Login | JWT via `/auth/login` (kept in memory; demo: sales@demo.in / demo1234) |
| Rates | live board rates per (metal, purity), pull-to-refresh |
| Stock | the counter scan flow: enter/scan an item or tag code → item details + **live price at today's rate** (`/items/:id/price`) — possible because tags never encode price |
| Estimate | find customer by phone, add items by code, issue a kaccha Estimate through the same document engine as the web admin |

## Design notes

- Dependency-light on purpose: no navigation library — a state-based tab
  switcher in `App.tsx`. Entry is a local `index.ts`
  (`registerRootComponent`) because pnpm's symlinked store breaks the
  classic `expo/AppEntry.js` relative path.
- `src/api.ts` mirrors the web wrapper: integer-paise money, Indian-format
  `inr()`, server-message errors.
- Scanned tag codes (`CODE#ordinal`) are accepted anywhere an item code is
  — the `#ordinal` suffix is stripped client-side.

## Run

```sh
pnpm --filter @erp/mobile start     # Expo dev server (Expo Go on device)
pnpm --filter @erp/mobile typecheck
```

For a physical device, set `expo.extra.apiUrl` in `app.json` to the API
machine's LAN address — a device cannot reach the host's `localhost`.
Verified in CI-style: `tsc --noEmit` + `expo export` (Metro → Hermes
bytecode) both pass.
