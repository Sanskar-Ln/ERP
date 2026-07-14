/**
 * Camera barcode scanner (shared component, used by both views).
 *
 * Bare React Native uses react-native-vision-camera (not expo-camera).
 * A "Scan" button opens a full-screen camera modal whose `useCodeScanner`
 * reads exactly the symbologies our tags are printed in — Code128 and
 * DataMatrix (see the tagging module) — and hands the decoded payload
 * (`ITEMCODE#ordinal`) to the caller, which strips the ordinal where only
 * the item code matters.
 *
 * This is barcode DECODING, not OCR — the tag payload is machine-readable
 * by design. Falls back gracefully: if the camera permission is denied,
 * staff can still type the code or use a USB/Bluetooth scanner (keyboard
 * wedge), which the input fields already accept.
 *
 * NATIVE SETUP (bare RN): vision-camera needs the camera permission
 * declared — android/app/src/main/AndroidManifest.xml `<uses-permission
 * android.permission.CAMERA/>` and ios Info.plist `NSCameraUsageDescription`
 * (both added in this repo), plus a pod install for iOS.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera';
import { ScanBarcode } from 'lucide-react-native';
import { color, font, radius } from '../lib/theme';

export default function BarcodeScanButton({ onScan }: { onScan: (code: string) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [denied, setDenied] = useState(false);
  const device = useCameraDevice('back');

  // Fires per detected barcode; guard so one scan doesn't spam the caller.
  const codeScanner = useCodeScanner({
    codeTypes: ['code-128', 'data-matrix'],
    onCodeScanned: (codes) => {
      const value = codes[0]?.value;
      if (value) {
        setOpen(false);
        onScan(value);
      }
    },
  });

  async function start(): Promise<void> {
    const status = await Camera.requestCameraPermission();
    if (status !== 'granted') {
      setDenied(true);
      return;
    }
    setDenied(false);
    setOpen(true);
  }

  return (
    <>
      <Pressable style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]} onPress={() => void start()}>
        <ScanBarcode size={17} color={color.gold700} strokeWidth={2.1} />
        <Text style={styles.btnText}>Scan</Text>
      </Pressable>
      {denied && <Text style={styles.denied}>camera denied — type the code instead</Text>}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          {device ? (
            <Camera style={StyleSheet.absoluteFill} device={device} isActive={open} codeScanner={codeScanner} />
          ) : (
            <Text style={styles.hint}>no camera device available</Text>
          )}
          <View style={styles.frame} pointerEvents="none" />
          <Text style={styles.hint}>point at the tag barcode (Code128 / DataMatrix)</Text>
          <Pressable style={styles.close} onPress={() => setOpen(false)}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: color.gold300,
    backgroundColor: color.gold50,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  btnText: { fontFamily: font.semibold, fontSize: 13.5, color: color.gold700 },
  denied: { fontFamily: font.regular, color: color.danger, fontSize: 11 },
  overlay: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end', alignItems: 'center' },
  frame: {
    position: 'absolute',
    top: '30%',
    left: '10%',
    right: '10%',
    height: '25%',
    borderWidth: 2,
    borderColor: color.gold300,
    borderRadius: radius.lg,
  },
  hint: { color: '#fff', marginBottom: 14, fontSize: 13, fontFamily: font.medium },
  close: {
    backgroundColor: color.gold600,
    borderRadius: radius.sm + 2,
    paddingHorizontal: 28,
    paddingVertical: 13,
    marginBottom: 42,
  },
  closeText: { color: '#fff', fontFamily: font.semibold, fontSize: 14 },
});
