/**
 * App configuration (bare React Native — no expo-constants).
 *
 * In Expo this lived in app.json `extra.apiUrl` and was read via
 * expo-constants. Bare RN has no such config channel, so the base URL is
 * a plain constant here. For a real build you'd typically wire
 * react-native-config (.env → BuildConfig / Info.plist); for the MVP a
 * single edit point is clearer.
 *
 * DEVICE/EMULATOR NOTE: a physical device or emulator cannot reach the
 * host's `localhost`. Use the machine's LAN address, or on the Android
 * emulator the host alias 10.0.2.2. Examples:
 *   Android emulator : http://10.0.2.2:3001/api/v1
 *   real device      : http://192.168.1.10:3001/api/v1
 */
export const API_URL = 'http://10.0.2.2:3001/api/v1';
