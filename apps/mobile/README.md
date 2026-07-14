# @erp/mobile

**Bare React Native (CLI)** thin client for the jewellery ERP —
online-only. Converted off Expo to the community CLI so the native
`android/` and `ios/` projects are in the repo and under your control.

Two role-based views (chosen by the login role; the API enforces the same
RBAC server-side, so the split is UX, not security):

- **Manager view** (OWNER/MANAGER) — Dashboard, Stock (create item,
  adjustment, receive transfers), Billing (invoice/estimate/challan,
  customer history, convert, cancel), Rates.
- **Sales counter view** (SALESPERSON/ACCOUNTANT) — Rates, scan-to-price
  stock Lookup, Estimate creation.

## Expo → bare RN: what changed

| Concern | Expo (before) | Bare RN CLI (now) |
|---------|---------------|-------------------|
| Entry | `registerRootComponent` (index.ts) | `AppRegistry.registerComponent` (index.js) + `app.json` name |
| Native projects | hidden/managed | committed `android/` + `ios/` |
| Run | `expo start` (Expo Go) | `react-native run-android` / `run-ios` (needs Android Studio / Xcode) |
| Config value (API URL) | `app.json` extra + `expo-constants` | plain `src/lib/config.ts` |
| Status bar | `expo-status-bar` | RN `StatusBar` |
| Safe area | `SafeAreaView` (RN) | `react-native-safe-area-context` |
| Fonts | `expo-font` + `@expo-google-fonts/*` (runtime load) | `.ttf` in `assets/fonts`, native-linked at build |
| Gradient | `expo-linear-gradient` | `react-native-linear-gradient` |
| Camera / barcode | `expo-camera` | `react-native-vision-camera` (code scanner) |
| Icons | `lucide-react-native` + `react-native-svg` | unchanged |

## Prerequisites (to actually run it)

- Node ≥ 18, JDK 17, **Android Studio + Android SDK** (Android)
- **macOS + Xcode + CocoaPods** (iOS only)
  — this is the trade-off vs Expo: bare RN needs the native toolchains
  locally; there is no Expo Go / cloud-build shortcut.

## pnpm monorepo note (important)

Bare RN autolinking (Gradle/CocoaPods) walks a **flat** `node_modules`,
but pnpm installs a symlinked store. Two accommodations are already in
place:

- `metro.config.js` watches the workspace root and follows symlinks, so
  Metro resolves `@erp/shared` and the hoisted deps.
- Native module autolinking is verified with `npx react-native config`
  (all four native modules resolve).

If a native build can't find a module, install the mobile app's deps with
a **hoisted** layout — from the repo root:
`pnpm install --config.node-linker=hoisted` — or run the app from a
checkout of just `apps/mobile` with `npm install`. (JS/Metro and
typechecking work under the normal pnpm layout as-is.)

## Fonts

`.ttf` files live in `assets/fonts/`; `react-native.config.js` lists that
folder. `npx react-native-asset` copies them into
`android/app/src/main/assets/fonts/` and registers them in the iOS
Info.plist (`UIAppFonts`). Family names in `src/lib/theme.ts` match the
file names (`Inter-Regular.ttf` → `"Inter-Regular"`). Re-run
`react-native-asset` after adding fonts.

## Camera / barcode (vision-camera)

- Permission is declared: Android `CAMERA` in the manifest, iOS
  `NSCameraUsageDescription` in Info.plist.
- The code scanner (MLKit) is opt-in on Android via
  `VisionCamera_enableCodeScanner=true` in `android/gradle.properties`
  (already set); `minSdkVersion` is 26.
- Scans Code128 + DataMatrix — exactly the tag symbologies. A
  USB/Bluetooth keyboard-wedge scanner also works (it types into the
  same fields).

## Layout (folders kept strictly separated)

```
index.js                  AppRegistry entry
app.json                  app name (for AppRegistry)
metro.config.js           monorepo/pnpm-aware Metro config
react-native.config.js    font asset linking
android/  ios/            native projects (committed)
assets/fonts/            bundled .ttf files
src/
├── lib/       api.ts · config.ts (API URL) · theme.ts (tokens)
├── components/ kit.tsx (UI primitives) · BarcodeScanButton.tsx
└── screens/
    ├── common/  LoginScreen, RatesScreen (both views)
    ├── manager/ DashboardScreen, StockScreen, BillingScreen
    └── sales/   LookupScreen, EstimateScreen
```

## Commands

```sh
pnpm --filter @erp/mobile start           # Metro dev server
pnpm --filter @erp/mobile android         # build + run on Android
pnpm --filter @erp/mobile ios             # build + run on iOS (macOS)
pnpm --filter @erp/mobile typecheck       # tsc --noEmit
pnpm --filter @erp/mobile bundle:android  # offline production JS bundle (CI check)
pnpm --filter @erp/mobile link-assets     # re-link fonts (react-native-asset)
```

Set the API base in `src/lib/config.ts` — the Android emulator reaches the
host at `http://10.0.2.2:3001/api/v1`; a real device needs the machine's
LAN address.
