/** Login — POST /auth/login, keep the JWT in memory (online-only MVP). */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api, setToken } from '../api';

export default function LoginScreen({ onLogin }: { onLogin: () => void }): React.JSX.Element {
  const [email, setEmail] = useState('sales@demo.in');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ accessToken: string }>('POST', '/auth/login', { email, password });
      setToken(res.accessToken);
      onLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Jewellery ERP</Text>
      <TextInput
        style={styles.input}
        placeholder="email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput style={styles.input} placeholder="password" secureTextEntry value={password} onChangeText={setPassword} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity style={styles.btn} onPress={() => void submit()} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 10 },
  title: { fontSize: 22, fontWeight: '700', color: '#b45309', marginBottom: 12, textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#d6d3d1', borderRadius: 6, padding: 10, backgroundColor: '#fff' },
  error: { color: '#dc2626', fontSize: 13 },
  btn: { backgroundColor: '#b45309', borderRadius: 6, padding: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
});
