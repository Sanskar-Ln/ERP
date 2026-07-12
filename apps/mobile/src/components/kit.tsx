/**
 * Component kit — the mobile UI primitives, one visual language for both
 * views (manager + sales). The React Native twin of web's components/ui.tsx.
 *
 * Rules encoded: status colours always carry a text label; stat-tile
 * values are sans semibold (never the display serif); primary actions are
 * gold with press feedback; cards are soft-shadowed warm surfaces.
 */
import React, { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { color, font, radius, shadow, statusTone } from '../lib/theme';

// ------------------------------------------------------------------ Btn

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Btn({
  title,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  small,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: BtnVariant;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
  icon?: ReactNode;
}): React.JSX.Element {
  const v = btnStyles[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.btnBase,
        small && styles.btnSmall,
        v.box,
        pressed && { opacity: 0.85, transform: [{ translateY: 1 }] },
        (disabled || busy) && { opacity: 0.45 },
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={v.text.color} /> : icon}
      <Text style={[styles.btnText, small && styles.btnTextSmall, v.text]}>{title}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- Card

export function Card({ children, style }: { children: ReactNode; style?: object }): React.JSX.Element {
  return <View style={[styles.card, style]}>{children}</View>;
}

// --------------------------------------------------------------- Badge

/** Status pill — reserved tones, label always visible. */
export function Badge({ status }: { status: string }): React.JSX.Element {
  const tone = statusTone[status] ?? { fg: color.neutral, bg: color.neutralBg };
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <Text style={[styles.badgeText, { color: tone.fg }]}>{status.replaceAll('_', ' ')}</Text>
    </View>
  );
}

// -------------------------------------------------------- ScreenHeader

/** Screen title block: display-serif title + muted description. */
export function ScreenHeader({ title, description }: { title: string; description?: string }): React.JSX.Element {
  return (
    <View style={{ marginBottom: 4 }}>
      <Text style={styles.screenTitle}>{title}</Text>
      {description ? <Text style={styles.screenDesc}>{description}</Text> : null}
    </View>
  );
}

// ------------------------------------------------------------ StatTile

/** Stat tile: small label, big sans-semibold value, optional footer. */
export function StatTile({ label, value, foot, style }: { label: string; value: string; foot?: ReactNode; style?: object }): React.JSX.Element {
  return (
    <View style={[styles.stat, style]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {foot ? <View style={{ marginTop: 4, alignSelf: 'flex-start' }}>{foot}</View> : null}
    </View>
  );
}

// --------------------------------------------------------------- Field

/** Labelled input — the premium form treatment. */
export function Field({ label, style, ...input }: TextInputProps & { label?: string; style?: object }): React.JSX.Element {
  return (
    <View style={[{ flexGrow: 1 }, style]}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput placeholderTextColor={color.inkMuted} {...input} style={styles.input} />
    </View>
  );
}

// ---------------------------------------------------------------- misc

export function SectionTitle({ children }: { children: ReactNode }): React.JSX.Element {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Hint({ children }: { children: ReactNode }): React.JSX.Element {
  return <Text style={styles.hint}>{children}</Text>;
}

/** Inline notice for successes/errors (tone by kind, always with text). */
export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success'; children: ReactNode }): React.JSX.Element {
  const tones = { info: { fg: color.gold700, bg: color.gold50 }, error: { fg: color.danger, bg: color.dangerBg }, success: { fg: color.good, bg: color.goodBg } };
  const t = tones[kind];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }]}>
      <Text style={{ color: t.fg, fontFamily: font.medium, fontSize: 13 }}>{children}</Text>
    </View>
  );
}

// -------------------------------------------------------------- styles

const btnStyles: Record<BtnVariant, { box: object; text: { color: string } }> = {
  primary: { box: { backgroundColor: color.gold600 }, text: { color: '#fff' } },
  secondary: { box: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.border }, text: { color: color.inkSecondary } },
  danger: { box: { backgroundColor: color.surface, borderWidth: 1, borderColor: '#fecaca' }, text: { color: color.danger } },
  ghost: { box: { backgroundColor: 'transparent' }, text: { color: color.gold700 } },
};

const styles = StyleSheet.create({
  btnBase: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: radius.sm + 2,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  btnSmall: { paddingHorizontal: 12, paddingVertical: 8 },
  btnText: { fontFamily: font.semibold, fontSize: 14 },
  btnTextSmall: { fontSize: 12.5 },

  card: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.borderSoft,
    padding: 16,
    gap: 8,
    ...shadow.card,
  },

  badge: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2.5, alignSelf: 'flex-start' },
  badgeText: { fontSize: 10.5, fontFamily: font.semibold, letterSpacing: 0.3 },

  screenTitle: { fontFamily: font.display, fontSize: 24, color: color.ink, letterSpacing: -0.3 },
  screenDesc: { fontFamily: font.regular, fontSize: 13, color: color.inkMuted, marginTop: 3, lineHeight: 18 },

  stat: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.borderSoft,
    padding: 14,
    ...shadow.card,
  },
  statLabel: { fontFamily: font.regular, fontSize: 12, color: color.inkSecondary },
  statValue: { fontFamily: font.semibold, fontSize: 20, color: color.ink, marginTop: 2 },

  fieldLabel: { fontFamily: font.medium, fontSize: 12, color: color.inkSecondary, marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.sm + 2,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: color.surface,
    fontFamily: font.regular,
    fontSize: 14,
    color: color.ink,
  },

  sectionTitle: { fontFamily: font.semibold, fontSize: 14.5, color: color.ink },
  hint: { fontFamily: font.regular, fontSize: 11.5, color: color.inkMuted, lineHeight: 16 },
  notice: { borderRadius: radius.sm + 2, paddingHorizontal: 12, paddingVertical: 9 },
});
