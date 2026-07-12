/**
 * Camera barcode scanner (shared component, used by both views).
 *
 * A "Scan" button that opens a full-screen camera overlay (expo-camera).
 * It reads exactly the symbologies our tags are printed in — Code128 and
 * DataMatrix (see the tagging module) — and hands the decoded payload
 * (`ITEMCODE#ordinal`) to the caller, which strips the ordinal where
 * only the item code matters.
 *
 * Note: this is barcode DECODING, not OCR — the tag payload is machine-
 * readable by design. Falls back gracefully: if camera permission is
 * denied, staff can still type the code or use a USB/Bluetooth scanner
 * (keyboard wedge), which the input fields already accept.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ScanBarcode } from 'lucide-react-native';
import { color, font, radius } from '../lib/theme';

export default function BarcodeScanButton({ onScan }: { onScan: (code: string) => void }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [denied, setDenied] = useState(false);

  async function start(): Promise<void> {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        setDenied(true);
        return;
      }
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
          <CameraView
            style={StyleSheet.absoluteFill}
            // Only the symbologies our tags use (tagging module).
            barcodeScannerSettings={{ barcodeTypes: ['code128', 'datamatrix'] }}
            onBarcodeScanned={({ data }) => {
              setOpen(false);
              onScan(data);
            }}
          />
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
