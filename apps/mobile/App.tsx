/**
 * Jewellery ERP mobile — thin online-only client with TWO role-based views:
 *
 * - MANAGER VIEW (role OWNER/MANAGER): src/screens/manager/ — Dashboard,
 *   Stock (create/adjust/receive transfers), full Billing, Rates.
 * - SALES (COUNTER) VIEW: src/screens/sales/ — Rates, scan-to-price
 *   Lookup, Estimate creation.
 *
 * Which view mounts is decided by the login role (session.isManager());
 * the API enforces the same RBAC server-side, so the split is UX, not
 * security. Shared screens live in src/screens/common/.
 *
 * Design: same brand as the web admin — Inter (all UI + figures) and
 * Fraunces (wordmark/titles only) loaded via expo-font from npm-bundled
 * @expo-google-fonts packages, gold accent, espresso tab bar with lucide
 * icons. Deliberately no navigation library — a state-based tab bar.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { LayoutDashboard, Package, ReceiptText, Coins, ScanBarcode, FilePlus2, LogOut, type LucideIcon } from 'lucide-react-native';
import { session } from './src/lib/api';
import { color, font } from './src/lib/theme';
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
  icon: LucideIcon;
  render: () => React.JSX.Element;
}

const MANAGER_TABS: TabDef[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, render: () => <DashboardScreen /> },
  { key: 'stock', label: 'Stock', icon: Package, render: () => <StockScreen /> },
  { key: 'billing', label: 'Billing', icon: ReceiptText, render: () => <BillingScreen /> },
  { key: 'rates', label: 'Rates', icon: Coins, render: () => <RatesScreen /> },
];

const SALES_TABS: TabDef[] = [
  { key: 'rates', label: 'Rates', icon: Coins, render: () => <RatesScreen /> },
  { key: 'lookup', label: 'Stock', icon: ScanBarcode, render: () => <LookupScreen /> },
  { key: 'estimate', label: 'Estimate', icon: FilePlus2, render: () => <EstimateScreen /> },
];

export default function App(): React.JSX.Element {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Fraunces_600SemiBold,
  });
  const [authed, setAuthed] = useState(session.authed());
  const [tabKey, setTabKey] = useState<string | null>(null);

  if (!fontsLoaded) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={color.gold500} size="large" />
      </View>
    );
  }

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
        {tabs.map((t) => {
          const isActive = active.key === t.key;
          const Icon = t.icon;
          return (
            <Pressable key={t.key} style={styles.tab} onPress={() => setTabKey(t.key)}>
              <View style={[styles.tabIconWrap, isActive && styles.tabIconActive]}>
                <Icon size={19} color={isActive ? color.gold300 : '#8a8078'} strokeWidth={2} />
              </View>
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
        <Pressable
          style={styles.tab}
          onPress={() => {
            session.clear();
            setAuthed(false);
          }}
        >
          <View style={styles.tabIconWrap}>
            <LogOut size={19} color="#8a8078" strokeWidth={2} />
          </View>
          <Text style={styles.tabText}>Exit</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.espresso950 },
  root: { flex: 1, backgroundColor: color.bg },
  body: { flex: 1 },
  tabbar: {
    flexDirection: 'row',
    backgroundColor: color.espresso950,
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 4,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3 },
  tabIconWrap: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 999 },
  tabIconActive: { backgroundColor: 'rgba(223,165,74,0.14)' },
  tabText: { fontFamily: font.medium, fontSize: 10.5, color: '#8a8078' },
  tabTextActive: { color: color.gold300 },
});
