/**
 * Login (common to both views) — POST /auth/login, keep JWT + user in
 * memory. The returned role decides which view App.tsx mounts.
 * Premium treatment: warm gradient backdrop, gem brand mark, labelled
 * fields — mirrors the web admin's auth screens.
 */
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Gem } from 'lucide-react-native';
import { api, session, type SessionUser } from '../../lib/api';
import { color, font, radius, shadow } from '../../lib/theme';
import { Btn, Field, Hint, Notice } from '../../components/kit';

export default function LoginScreen({ onLogin }: { onLogin: () => void }): React.JSX.Element {
  const [email, setEmail] = useState('manager@demo.in');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ accessToken: string; user: SessionUser }>('POST', '/auth/login', { email, password });
      session.set(res.accessToken, res.user);
      onLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <LinearGradient colors={['#f5f5f4', color.bg, color.gold50]} style={styles.fill}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <View style={styles.brand}>
          <LinearGradient colors={[color.gold400, color.gold600]} style={styles.mark}>
            <Gem size={24} color="#fff" strokeWidth={2.2} />
          </LinearGradient>
          <Text style={styles.title}>Jewellery ERP</Text>
          <Text style={styles.subtitle}>Sign in to your organisation</Text>
        </View>

        <View style={styles.cardBox}>
          <Field label="Email" placeholder="you@shop.in" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <Field label="Password" placeholder="••••••••" secureTextEntry value={password} onChangeText={setPassword} />
          {error ? <Notice kind="error">{error}</Notice> : null}
          <Btn title={busy ? 'Signing in…' : 'Sign in'} onPress={() => void submit()} busy={busy} />
          <View style={styles.hints}>
            <Hint>manager view: manager@demo.in · counter view: sales@demo.in</Hint>
            <Hint>password demo1234</Hint>
          </View>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  wrap: { flex: 1, justifyContent: 'center', padding: 24 },
  brand: { alignItems: 'center', marginBottom: 22, gap: 4 },
  mark: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    ...shadow.card,
  },
  title: { fontFamily: font.display, fontSize: 26, color: color.ink, letterSpacing: -0.3 },
  subtitle: { fontFamily: font.regular, fontSize: 13.5, color: color.inkMuted },
  cardBox: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.borderSoft,
    padding: 20,
    gap: 14,
    ...shadow.card,
  },
  hints: { alignItems: 'center', gap: 2, borderTopWidth: 1, borderTopColor: color.borderSoft, paddingTop: 12 },
});
