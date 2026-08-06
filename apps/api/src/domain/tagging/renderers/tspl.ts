/**
 * TSPL/TSPL2 renderer (TSC, Godex, Argox) — PURE function of a LabelLayout.
 *
 * TSPL differs from ZPL in two ways that matter here:
 * - it takes the label SIZE in millimetres directly (no dpi maths for SIZE),
 *   but element coordinates are still in dots;
 * - it is line-oriented: one command per line, terminated by CRLF, and the
 *   job ends with PRINT <sets>,<copies>.
 *
 * Commands used: SIZE / GAP / DIRECTION / CLS / TEXT / BARCODE / DMATRIX /
 * PRINT — the common subset every TSPL printer implements.
 */
import { BarcodeSymbology } from '@erp/shared';
import { mmToDots, type LabelLayout } from '../label-layout';

/** TSPL string literals are double-quoted; escape embedded quotes/backslash. */
const escapeTspl = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

/**
 * Map a point size onto the nearest built-in TSPL bitmap font.
 * Fonts "1".."5" are progressively larger; scalable font "0" needs explicit
 * sizing, so the bitmap ladder is the portable choice for tiny jewellery text.
 */
function tsplFont(pt: number): string {
  if (pt <= 5) return '1';
  if (pt <= 7) return '2';
  if (pt <= 10) return '3';
  if (pt <= 14) return '4';
  return '5';
}

/**
 * Render one label as TSPL.
 * @param layout device-independent layout
 * @param dpi    printhead resolution (203 / 300 / 600)
 * @param copies identical copies to print
 */
export function renderTspl(layout: LabelLayout, dpi: number, copies = 1): string {
  const lines: string[] = [];
  // SIZE takes millimetres; GAP 2mm is the usual die-cut gap on label stock.
  lines.push(`SIZE ${layout.widthMm.toFixed(1)} mm,${layout.heightMm.toFixed(1)} mm`);
  lines.push('GAP 2 mm,0 mm');
  lines.push('DIRECTION 1');
  lines.push('CLS');

  for (const el of layout.elements) {
    const x = mmToDots(el.xMm, dpi);
    const y = mmToDots(el.yMm, dpi);
    if (el.kind === 'barcode') {
      const h = mmToDots(el.hMm, dpi);
      if (layout.symbology === BarcodeSymbology.DATAMATRIX) {
        // DMATRIX x,y,width,height,"data"
        const side = Math.max(h, mmToDots(el.hMm, dpi));
        lines.push(`DMATRIX ${x},${y},${side},${side},"${escapeTspl(el.value)}"`);
      } else {
        // BARCODE x,y,"128",height,human-readable,rotation,narrow,wide,"data"
        lines.push(`BARCODE ${x},${y},"128",${h},0,0,2,4,"${escapeTspl(el.value)}"`);
      }
    } else {
      // TEXT x,y,"font",rotation,x-mul,y-mul,"data"
      lines.push(`TEXT ${x},${y},"${tsplFont(el.fontPt ?? 6)}",0,1,1,"${escapeTspl(el.value)}"`);
    }
  }

  lines.push(`PRINT 1,${copies}`);
  return lines.join('\r\n') + '\r\n';
}

/** Concatenate many labels into one job. */
export const renderTsplBatch = (layouts: LabelLayout[], dpi: number): string =>
  layouts.map((l) => renderTspl(l, dpi)).join('');
