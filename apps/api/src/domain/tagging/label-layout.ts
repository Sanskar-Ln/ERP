/**
 * Label layout — PURE domain logic (no NestJS, no Prisma, no printer).
 *
 * THE POINT OF THIS MODULE: a label is described once, in millimetres, and
 * knows nothing about the hardware that will print it. Renderers (ZPL for
 * Zebra, TSPL for TSC/Godex, HTML for a browser) all consume the SAME
 * `LabelLayout`. That is what lets a shop register a printer before knowing
 * its brand — identification only decides which renderer runs, never how the
 * label is designed.
 *
 * SHAPES:
 * - RECTANGLE: one printable area; fields flow top-to-bottom.
 * - DUMBBELL: the jewellery "butterfly" tag — two printable flags joined by
 *   a narrow neck that wraps around a ring shank or chain. The neck is NEVER
 *   printed on (it is hidden once wrapped), so elements are confined to the
 *   flags. Fields choose their flag via `region: LEFT | RIGHT`.
 *
 * PRICE-FREE RULE: barcode payloads run through `assertPriceFreePayload`
 * here too, so no renderer can smuggle a price into a barcode.
 */
import { LabelField, LabelRegion, TagShape, type BarcodeSymbology } from '@erp/shared';
import { assertPriceFreePayload } from './tag-code';

/** Template geometry + field placement, as stored on LabelTemplate. */
export interface LabelTemplateSpec {
  shape: TagShape;
  widthMm: number;
  heightMm: number;
  /** dumbbell only — must sum to widthMm */
  leftFlagMm?: number | null;
  neckMm?: number | null;
  rightFlagMm?: number | null;
  symbology: BarcodeSymbology;
  fields: { field: LabelField; region: LabelRegion; fontPt: number }[];
}

/** The data a single tag contributes to its label. */
export interface TagLabelData {
  tagCode: string;
  itemCode: string;
  name: string;
  category: string | null;
  /** already formatted, e.g. "12.500" */
  grossWeightG: string;
  netWeightG: string;
  purityLabel: string;
  pieces: number;
  hallmarkNo: string | null;
}

export interface LabelElement {
  kind: 'text' | 'barcode';
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
  value: string;
  /** text only */
  fontPt?: number;
  align?: 'left' | 'center';
}

export interface LabelLayout {
  widthMm: number;
  heightMm: number;
  symbology: BarcodeSymbology;
  elements: LabelElement[];
}

/** Padding inside each printable region, mm. Keeps ink off the die-cut edge. */
const PAD_MM = 1;
/** A barcode needs real estate; give it this share of the region height. */
const BARCODE_HEIGHT_SHARE = 0.45;
/** Approximate mm height of one point of text (1pt = 1/72in = 0.3528mm). */
const PT_TO_MM = 0.3528;

/** Resolve one field to its printable string. Empty string ⇒ skip. */
export function fieldText(field: LabelField, d: TagLabelData): string {
  switch (field) {
    case LabelField.BARCODE:
      return d.tagCode;
    case LabelField.ITEM_CODE:
      return d.itemCode;
    case LabelField.NAME:
      return d.name;
    case LabelField.CATEGORY:
      return d.category ?? '';
    case LabelField.GROSS_WEIGHT:
      return d.grossWeightG ? `G ${d.grossWeightG}g` : '';
    case LabelField.NET_WEIGHT:
      return d.netWeightG ? `N ${d.netWeightG}g` : '';
    case LabelField.PURITY:
      return d.purityLabel;
    case LabelField.PIECES:
      return `${d.pieces} pc`;
    case LabelField.HALLMARK:
      return d.hallmarkNo ? `HUID ${d.hallmarkNo}` : '';
    case LabelField.PRICE_TEXT:
      // NEVER a number: the price is resolved live at scan time, which is
      // exactly why a rate change never forces a reprint.
      return 'rate-based';
    default:
      return '';
  }
}

/** A printable box on the tag (the whole sticker, or one dumbbell flag). */
interface Region {
  xMm: number;
  wMm: number;
}

/** Compute the printable regions of a template. Throws on bad geometry. */
export function regionsOf(t: LabelTemplateSpec): Record<LabelRegion, Region | undefined> {
  if (t.widthMm <= 0 || t.heightMm <= 0) throw new RangeError('label dimensions must be positive');
  if (t.shape === TagShape.DUMBBELL) {
    const left = t.leftFlagMm ?? 0;
    const neck = t.neckMm ?? 0;
    const right = t.rightFlagMm ?? 0;
    if (left <= 0 || neck <= 0 || right <= 0) {
      throw new RangeError('dumbbell templates need positive leftFlagMm, neckMm and rightFlagMm');
    }
    if (Math.abs(left + neck + right - t.widthMm) > 0.01) {
      throw new RangeError(`dumbbell flags (${left}+${neck}+${right}) must span widthMm (${t.widthMm})`);
    }
    return {
      MAIN: { xMm: 0, wMm: t.widthMm },
      LEFT: { xMm: 0, wMm: left },
      // the neck is deliberately skipped — it wraps the jewellery, so
      // anything printed there would be hidden
      RIGHT: { xMm: left + neck, wMm: right },
    };
  }
  return { MAIN: { xMm: 0, wMm: t.widthMm }, LEFT: undefined, RIGHT: undefined };
}

/**
 * Lay a template + tag out into device-independent elements.
 * Fields stack top-down within their region; a BARCODE takes a fixed share
 * of the height and the remaining text splits what is left.
 */
export function layoutLabel(t: LabelTemplateSpec, d: TagLabelData): LabelLayout {
  const regions = regionsOf(t);
  const elements: LabelElement[] = [];

  // Group the requested fields by the region they were placed in. On a
  // rectangle everything collapses into MAIN.
  const groups = new Map<LabelRegion, { field: LabelField; fontPt: number }[]>();
  for (const spec of t.fields) {
    const region = t.shape === TagShape.DUMBBELL ? spec.region : LabelRegion.MAIN;
    if (!regions[region]) {
      throw new RangeError(`template has no ${region} region for field ${spec.field}`);
    }
    const list = groups.get(region) ?? [];
    list.push({ field: spec.field, fontPt: spec.fontPt });
    groups.set(region, list);
  }

  for (const [region, specs] of groups) {
    const box = regions[region]!;
    const innerX = box.xMm + PAD_MM;
    const innerW = Math.max(0, box.wMm - PAD_MM * 2);
    const innerH = Math.max(0, t.heightMm - PAD_MM * 2);

    // Resolve text now so empty fields don't reserve vertical space.
    const resolved = specs
      .map((s) => ({ ...s, text: fieldText(s.field, d) }))
      .filter((s) => s.text !== '');
    if (resolved.length === 0) continue;

    const hasBarcode = resolved.some((s) => s.field === LabelField.BARCODE);
    const barcodeH = hasBarcode ? innerH * BARCODE_HEIGHT_SHARE : 0;
    const textCount = resolved.length - (hasBarcode ? 1 : 0);
    const textH = textCount > 0 ? (innerH - barcodeH) / textCount : 0;

    let y = PAD_MM;
    for (const s of resolved) {
      if (s.field === LabelField.BARCODE) {
        assertPriceFreePayload(s.text); // belt and braces before any renderer
        elements.push({ kind: 'barcode', xMm: innerX, yMm: y, wMm: innerW, hMm: barcodeH, value: s.text });
        y += barcodeH;
      } else {
        elements.push({
          kind: 'text',
          xMm: innerX,
          yMm: y,
          wMm: innerW,
          // a line is never taller than its slot, nor than the glyphs need
          hMm: Math.min(textH, s.fontPt * PT_TO_MM * 1.4),
          value: s.text,
          fontPt: s.fontPt,
          align: 'center',
        });
        y += textH;
      }
    }
  }

  return { widthMm: t.widthMm, heightMm: t.heightMm, symbology: t.symbology, elements };
}

/** Millimetres → printer dots at a given head resolution (203/300/600 dpi). */
export const mmToDots = (mm: number, dpi: number): number => Math.round((mm * dpi) / 25.4);
