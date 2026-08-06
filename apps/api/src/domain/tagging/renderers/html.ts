/**
 * HTML renderer — PURE function of a LabelLayout (barcodes supplied as
 * pre-rendered data URIs by the caller, keeping this module dependency-free).
 *
 * This is the zero-setup print path: any printer already installed on the
 * shop's PC prints these, because the browser drives it. Elements are placed
 * absolutely in millimetres so the sheet matches what ZPL/TSPL would produce
 * on a dedicated label printer.
 *
 * On a DUMBBELL tag the neck is left blank by construction — the layout
 * engine never places elements there — and a faint guide line marks the fold
 * so staff can see where the tag wraps (screen only; hidden when printing).
 */
import { TagShape } from '@erp/shared';
import type { LabelLayout } from '../label-layout';

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface HtmlLabelInput {
  layout: LabelLayout;
  /** data: URI for each barcode element, keyed by its payload */
  barcodeDataUris: Map<string, string>;
}

/** Neck geometry for the fold guide (dumbbell only). */
export interface NeckGuide {
  shape: TagShape;
  leftFlagMm?: number | null;
  neckMm?: number | null;
}

/** Render a single label as a positioned <div>. */
function labelHtml(input: HtmlLabelInput, neck?: NeckGuide): string {
  const { layout, barcodeDataUris } = input;
  const parts: string[] = [];

  if (neck?.shape === TagShape.DUMBBELL && neck.leftFlagMm != null && neck.neckMm != null) {
    parts.push(
      `<div class="neck" style="left:${neck.leftFlagMm}mm;width:${neck.neckMm}mm"></div>`,
    );
  }

  for (const el of layout.elements) {
    const box = `left:${el.xMm}mm;top:${el.yMm}mm;width:${el.wMm}mm;height:${el.hMm}mm`;
    if (el.kind === 'barcode') {
      const uri = barcodeDataUris.get(el.value);
      parts.push(
        uri
          ? `<img class="bc" style="${box}" src="${uri}" alt="${esc(el.value)}"/>`
          : `<div class="t" style="${box}">${esc(el.value)}</div>`,
      );
    } else {
      parts.push(
        `<div class="t" style="${box};font-size:${el.fontPt ?? 6}pt;text-align:${el.align ?? 'center'}">${esc(el.value)}</div>`,
      );
    }
  }

  return `<div class="label" style="width:${layout.widthMm}mm;height:${layout.heightMm}mm">${parts.join('')}</div>`;
}

/** Render a whole batch as one printable sheet. */
export function renderHtmlSheet(labels: HtmlLabelInput[], title: string, neck?: NeckGuide): string {
  const body = labels.map((l) => labelHtml(l, neck)).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
*{box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:4mm;display:flex;flex-wrap:wrap;gap:2mm;background:#f5f5f4}
.label{position:relative;background:#fff;border:0.2mm dashed #bbb;overflow:hidden;page-break-inside:avoid}
.t{position:absolute;line-height:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bc{position:absolute;object-fit:contain}
/* the neck wraps around the jewellery — never printed on, shown as a guide */
.neck{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(45deg,#f5f5f4,#f5f5f4 1mm,#e7e5e4 1mm,#e7e5e4 2mm)}
@media print{body{padding:0;background:#fff;gap:0}.label{border:none}.neck{display:none}}
</style></head><body>${body}</body></html>`;
}
