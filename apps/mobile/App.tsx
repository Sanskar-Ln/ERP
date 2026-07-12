/**
 * Jewellery ERP mobile — thin online-only client with TWO role-based views:
 *
 * - MANAGER VIEW (role OWNER/MANAGER): the admin from the phone —
 *   Dashboard (rates + stock position + recent documents), Stock
 *   (create items, adjustments, receive transfers), Billing (full
 *   document engine: invoice/estimate/challan, convert, cancel), Rates.
 *   Screens live in src/screens/manager/.
 *
 * - SALES (COUNTER) VIEW (role SALESPERSON/ACCOUNTANT): Rates, Stock
 *   lookup (scan → live price), Estimate creation.
 *   Screens live in src/screens/sales/.
 *
 * Which view mounts is decided by the role in the login response
 * (session.isManager()); the API enforces the same RBAC server-side, so
 * the view split is UX, not security. Shared screens live in
 * src/screens/common/. Deliberately dependency-light: no navigation
 * library, just a state-based tab bar.
 */
import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { session, ui } from './src/lib/api';
import LoginScreen from './src/screens/common/LoginScreen';
import RatesScreen from './src/screens/common/RatesScreen';
import LookupScreen from './src/screens/sales/LookupScreen';
import EstimateScreen from './src/screens/sales/EstimateScreen';
import DashboardScreen from './src/screens/manager/DashboardScreen';
import StockScreen from './src/screens/manager/StockScreen';
import BillingScreen from './src/screens/manager/BillingScreen';

interface TabDef {
  key: string;
  label: string;
  render: () => React.JSX.Element;
}

const MANAGER_TABS: TabDef[] = [
  { key: 'dashboard', label: 'Dashboard', render: () => <DashboardScreen /> },
  { key: 'stock', label: 'Stock', render: () => <StockScreen /> },
  { key: 'billing', label: 'Billing', render: () => <BillingScreen /> },
  { key: 'rates', label: 'Rates', render: () => <RatesScreen /> },
];

const SALES_TABS: TabDef[] = [
  { key: 'rates', label: 'Rates', render: () => <RatesScreen /> },
  { key: 'lookup', label: 'Stock', render: () => <LookupScreen /> },
  { key: 'estimate', label: 'Estimate', render: () => <EstimateScreen /> },
];

export default function App(): React.JSX.Element {
  const [authed, setAuthed] = useState(session.authed());
  const [tabKey, setTabKey] = useState<string | null>(null);

  if (!authed) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar style="dark" />
        <LoginScreen
          onLogin={() => {
            setTabKey(null); // first tab of whichever view the role gets
            setAuthed(true);
          }}
        />
      </SafeAreaView>
    );
  }

  const tabs = session.isManager() ? MANAGER_TABS : SALES_TABS;
  const active = tabs.find((t) => t.key === tabKey) ?? tabs[0]!;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="dark" />
      <View style={styles.body}>{active.render()}</View>
      <View style={styles.tabbar}>
        {tabs.map((t) => (
          <TouchableOpacity key={t.key} style={styles.tab} onPress={() => setTabKey(t.key)}>
            <Text style={[styles.tabText, active.key === t.key && styles.tabActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.tab}
          onPress={() => {
            session.clear();
            setAuthed(false);
          }}
        >
          <Text style={styles.tabText}>Exit</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ui.bg },
  body: { flex: 1 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: ui.border, backgroundColor: '#fff' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabText: { fontSize: 13, color: ui.muted },
  tabActive: { color: ui.amber, fontWeight: '600' },
});
