/**
 * Jewellery ERP mobile — thin online-only client (MVP).
 *
 * Deliberately dependency-light: no navigation library, just a state-based
 * screen switcher with a bottom tab bar. Screens: board rates, stock
 * lookup by item code (the scan-entry flow — barcode scanners type the
 * tag code), and estimate creation at the counter.
 */
import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { hasToken } from './src/api';
import LoginScreen from './src/screens/LoginScreen';
import RatesScreen from './src/screens/RatesScreen';
import LookupScreen from './src/screens/LookupScreen';
import EstimateScreen from './src/screens/EstimateScreen';

type Tab = 'rates' | 'lookup' | 'estimate';

const TABS: { key: Tab; label: string }[] = [
  { key: 'rates', label: 'Rates' },
  { key: 'lookup', label: 'Stock' },
  { key: 'estimate', label: 'Estimate' },
];

export default function App(): React.JSX.Element {
  const [authed, setAuthed] = useState(hasToken());
  const [tab, setTab] = useState<Tab>('rates');

  if (!authed) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        <LoginScreen onLogin={() => setAuthed(true)} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.body}>
        {tab === 'rates' && <RatesScreen />}
        {tab === 'lookup' && <LookupScreen />}
        {tab === 'estimate' && <EstimateScreen />}
      </View>
      <View style={styles.tabbar}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={styles.tab} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fafaf9' },
  body: { flex: 1 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e7e5e4', backgroundColor: '#fff' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 14, color: '#78716c' },
  tabActive: { color: '#b45309', fontWeight: '600' },
});
