/**
 * Design tokens — the mobile twin of the web admin's design system.
 *
 * Same brand: Inter for all UI text and figures, Fraunces reserved for
 * the wordmark and screen titles, a restrained gold accent over warm
 * stone neutrals, espresso for dark chrome, and RESERVED status colours
 * that always ship with a text label (never colour alone).
 */

export const color = {
  // gold ramp (matches web @theme)
  gold50: '#fdf9ef',
  gold100: '#f9efd8',
  gold200: '#f2dcab',
  gold300: '#e9c377',
  gold400: '#dfa54a',
  gold500: '#d28c2a',
  gold600: '#b76f1f',
  gold700: '#93541c',
  gold900: '#63381b',

  // espresso chrome
  espresso900: '#211a15',
  espresso950: '#17110d',

  // warm neutrals (stone)
  bg: '#fafaf9',
  surface: '#ffffff',
  border: '#e7e5e4',
  borderSoft: '#f0efee',
  ink: '#1c1917',
  inkSecondary: '#57534e',
  inkMuted: '#a8a29e',

  // reserved status tones
  good: '#047857',
  goodBg: '#ecfdf5',
  info: '#0369a1',
  infoBg: '#f0f9ff',
  warn: '#b45309',
  warnBg: '#fffbeb',
  danger: '#b91c1c',
  dangerBg: '#fef2f2',
  neutral: '#57534e',
  neutralBg: '#f5f5f4',
} as const;

/** Font family names as registered by expo-font (see App.tsx useFonts). */
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  /** display serif — wordmark and screen titles ONLY, never figures */
  display: 'Fraunces_600SemiBold',
} as const;

export const radius = { sm: 8, md: 12, lg: 16, full: 999 } as const;

/** Soft card shadow (iOS) + elevation (Android). */
export const shadow = {
  card: {
    shadowColor: '#292524',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
} as const;

/** Status → tone mapping, mirrored from the web Badge component. */
export const statusTone: Record<string, { fg: string; bg: string }> = {
  IN_STOCK: { fg: color.good, bg: color.goodBg },
  SOLD: { fg: color.info, bg: color.infoBg },
  IN_TRANSIT: { fg: color.warn, bg: color.warnBg },
  WITH_KARIGAR: { fg: color.warn, bg: color.warnBg },
  SCRAPPED: { fg: color.neutral, bg: color.neutralBg },
  RECEIVED: { fg: color.good, bg: color.goodBg },
  ISSUED: { fg: color.good, bg: color.goodBg },
  CONVERTED: { fg: color.info, bg: color.infoBg },
  CANCELLED: { fg: color.danger, bg: color.dangerBg },
  SUPERSEDED: { fg: color.neutral, bg: color.neutralBg },
  DRAFT: { fg: color.neutral, bg: color.neutralBg },
  TAX_INVOICE: { fg: color.info, bg: color.infoBg },
  ESTIMATE: { fg: color.neutral, bg: color.neutralBg },
  DELIVERY_CHALLAN: { fg: color.neutral, bg: color.neutralBg },
  MANUAL_FIX: { fg: color.warn, bg: color.warnBg },
  FEED: { fg: color.neutral, bg: color.neutralBg },
};
