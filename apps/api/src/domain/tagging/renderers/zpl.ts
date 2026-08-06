/**
 * ZPL II renderer (Zebra) — PURE function of a LabelLayout.
 *
 * Emits one label per call: `^XA … ^XZ`. Millimetres become dots at the
 * printhead's dpi, so the same layout prints identically on a 203 dpi
 * desktop unit and a 300 dpi industrial one.
 *
 * Commands used (deliberately a conservative subset — every Zebra since the
 * ZPL II era understands these):
 *   ^XA/^XZ  label start/end        ^PW  print width (dots)
 *   ^LL      label length           ^FO  field origin (x,y dots)
 *   ^BY      barcode module width   ^BCN/^BXN  Code128 / DataMatrix
 *   ^A0N     scalable font (h,w)    ^FD…^FS   field data/terminator
 */
import { BarcodeSymbology } from '@erp/shared';
import { mmToDots, type LabelLayout } from '../label-layout';

/** ^FD data must not contain the field terminator or control prefixes. */
const escapeZpl = (s: string): string => s.replace(/[\^~]/g, ' ');

/** Point size → ZPL dot height for ^A0N at the given dpi. */
const ptToDots = (pt: number, dpi: number): number => Math.max(6, Math.round((pt * dpi) / 72));

/**
 * Render one label as ZPL.
 * @param layout device-independent layout
 * @param dpi    printhead resolution (203 / 300 / 600)
 * @param copies how many identical labels to print (^PQ)
 */
export function renderZpl(layout: LabelLayout, dpi: number, copies = 1): string {
  const out: string[] = ['^XA'];
  out.push(`^PW${mmToDots(layout.widthMm, dpi)}`);
  out.push(`^LL${mmToDots(layout.heightMm, dpi)}`);
  // ^LH0,0 — we place everything absolutely, so no home offset
  out.push('^LH0,0');

  for (const el of layout.elements) {
    const x = mmToDots(el.xMm, dpi);
    const y = mmToDots(el.yMm, dpi);
    if (el.kind === 'barcode') {
      const h = mmToDots(el.hMm, dpi);
      out.push(`^FO${x},${y}`);
      if (layout.symbology === BarcodeSymbology.DATAMATRIX) {
        // ^BXN,<height of individual symbol element>,<quality>
        out.push(`^BXN,${Math.max(2, Math.round(h / 20))},200`);
      } else {
        out.push('^BY2');
        // ^BCN,<height>,<print interpretation line>,<above>,<check digit>
        out.push(`^BCN,${h},N,N,N`);
      }
      out.push(`^FD${escapeZpl(el.value)}^FS`);
    } else {
      const fh = ptToDots(el.fontPt ?? 6, dpi);
      out.push(`^FO${x},${y}`);
      out.push(`^A0N,${fh},${fh}`);
      if (el.align === 'center') {
        // ^FB<width>,<lines>,<line gap>,<justify> centres within the field box
        out.push(`^FB${mmToDots(el.wMm, dpi)},1,0,C`);
      }
      out.push(`^FD${escapeZpl(el.value)}^FS`);
    }
  }

  if (copies > 1) out.push(`^PQ${copies}`);
  out.push('^XZ');
  return out.join('\n');
}

/** Concatenate many labels into one job. */
export const renderZplBatch = (layouts: LabelLayout[], dpi: number): string =>
  layouts.map((l) => renderZpl(l, dpi)).join('\n');
