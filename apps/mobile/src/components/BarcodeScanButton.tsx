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
 * readable by design, so no text recognition is needed. Falls back
 * gracefully: if camera permission is denied, staff can still type the
 * code or use a USB/Bluetooth scanner (keyboard wedge), which the input
 * fields already accept.
 */
import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ui } from '../lib/api';

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
      <TouchableOpacity style={styles.btn} onPress={() => void start()}>
        <Text style={styles.btnText}>Scan</Text>
      </TouchableOpacity>
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
          <TouchableOpacity style={styles.close} onPress={() => setOpen(false)}>
            <Text style={styles.btnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: ui.amber, borderRadius: 6, paddingHorizontal: 14, justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  denied: { color: ui.red, fontSize: 11 },
  overlay: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end', alignItems: 'center' },
  frame: {
    position: 'absolute',
    top: '30%',
    left: '10%',
    right: '10%',
    height: '25%',
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 12,
  },
  hint: { color: '#fff', marginBottom: 12, fontSize: 13 },
  close: { backgroundColor: ui.amber, borderRadius: 6, paddingHorizontal: 24, paddingVertical: 12, marginBottom: 40 },
});
