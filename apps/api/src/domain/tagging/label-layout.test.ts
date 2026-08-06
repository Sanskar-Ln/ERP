import { describe, expect, it } from 'vitest';
import { BarcodeSymbology, LabelField, LabelRegion, TagShape } from '@erp/shared';
import { fieldText, layoutLabel, mmToDots, regionsOf, type LabelTemplateSpec, type TagLabelData } from './label-layout';

const DATA: TagLabelData = {
  tagCode: 'RING-0001#1',
  itemCode: 'RING-0001',
  name: 'Ladies ring',
  category: 'Ring',
  grossWeightG: '12.500',
  netWeightG: '11.800',
  purityLabel: '22K',
  pieces: 1,
  hallmarkNo: 'HUID123',
};

/** 75×13 chain tag: 30mm flag + 15mm neck + 30mm flag. */
const DUMBBELL: LabelTemplateSpec = {
  shape: TagShape.DUMBBELL,
  widthMm: 75,
  heightMm: 13,
  leftFlagMm: 30,
  neckMm: 15,
  rightFlagMm: 30,
  symbology: BarcodeSymbology.CODE128,
  fields: [
    { field: LabelField.BARCODE, region: LabelRegion.LEFT, fontPt: 6 },
    { field: LabelField.ITEM_CODE, region: LabelRegion.LEFT, fontPt: 5 },
    { field: LabelField.NET_WEIGHT, region: LabelRegion.RIGHT, fontPt: 6 },
    { field: LabelField.PURITY, region: LabelRegion.RIGHT, fontPt: 6 },
  ],
};

const RECT: LabelTemplateSpec = {
  shape: TagShape.RECTANGLE,
  widthMm: 40,
  heightMm: 12,
  symbology: BarcodeSymbology.CODE128,
  fields: [
    { field: LabelField.BARCODE, region: LabelRegion.MAIN, fontPt: 6 },
    { field: LabelField.ITEM_CODE, region: LabelRegion.MAIN, fontPt: 5 },
  ],
};

describe('regionsOf', () => {
  it('splits a dumbbell into two flags and skips the neck', () => {
    const r = regionsOf(DUMBBELL);
    expect(r.LEFT).toEqual({ xMm: 0, wMm: 30 });
    // right flag starts AFTER the neck (30 + 15)
    expect(r.RIGHT).toEqual({ xMm: 45, wMm: 30 });
    // the neck strip (30..45) belongs to no printable region
    expect(r.LEFT!.wMm + r.RIGHT!.wMm).toBeLessThan(DUMBBELL.widthMm);
  });

  it('a rectangle has only MAIN', () => {
    const r = regionsOf(RECT);
    expect(r.MAIN).toEqual({ xMm: 0, wMm: 40 });
    expect(r.LEFT).toBeUndefined();
  });

  it('rejects flags that do not span the tag width', () => {
    expect(() => regionsOf({ ...DUMBBELL, rightFlagMm: 20 })).toThrow(RangeError);
    expect(() => regionsOf({ ...DUMBBELL, neckMm: 0 })).toThrow(RangeError);
    expect(() => regionsOf({ ...RECT, widthMm: 0 })).toThrow(RangeError);
  });
});

describe('layoutLabel', () => {
  it('places every requested field on a dumbbell, inside its own flag', () => {
    const l = layoutLabel(DUMBBELL, DATA);
    expect(l.elements).toHaveLength(4);

    const left = l.elements.filter((e) => e.xMm < 45);
    const right = l.elements.filter((e) => e.xMm >= 45);
    expect(left).toHaveLength(2);
    expect(right).toHaveLength(2);

    // nothing may bleed past its flag's right edge, or off the tag
    for (const e of left) expect(e.xMm + e.wMm).toBeLessThanOrEqual(30);
    for (const e of right) expect(e.xMm + e.wMm).toBeLessThanOrEqual(75);
    for (const e of l.elements) expect(e.yMm + e.hMm).toBeLessThanOrEqual(13.001);
  });

  it('puts the barcode payload on the label and keeps it price-free', () => {
    const l = layoutLabel(DUMBBELL, DATA);
    const bc = l.elements.find((e) => e.kind === 'barcode');
    expect(bc?.value).toBe('RING-0001#1');
    // a payload that smells of money is refused outright
    expect(() => layoutLabel(DUMBBELL, { ...DATA, tagCode: 'RING-0001#₹4500' })).toThrow(RangeError);
  });

  it('collapses regions to MAIN on a rectangle even if LEFT/RIGHT were set', () => {
    const l = layoutLabel({ ...RECT, fields: [{ field: LabelField.ITEM_CODE, region: LabelRegion.LEFT, fontPt: 5 }] }, DATA);
    expect(l.elements).toHaveLength(1);
    expect(l.elements[0]!.xMm).toBe(1); // MAIN + padding
  });

  it('skips fields whose text is empty rather than leaving a gap', () => {
    const noHallmark = { ...DATA, hallmarkNo: null };
    const l = layoutLabel(
      { ...RECT, fields: [{ field: LabelField.HALLMARK, region: LabelRegion.MAIN, fontPt: 5 }, { field: LabelField.ITEM_CODE, region: LabelRegion.MAIN, fontPt: 5 }] },
      noHallmark,
    );
    expect(l.elements).toHaveLength(1);
    expect(l.elements[0]!.value).toBe('RING-0001');
  });
});

describe('fieldText', () => {
  it('formats weights, purity, pieces and hallmark', () => {
    expect(fieldText(LabelField.GROSS_WEIGHT, DATA)).toBe('G 12.500g');
    expect(fieldText(LabelField.NET_WEIGHT, DATA)).toBe('N 11.800g');
    expect(fieldText(LabelField.PURITY, DATA)).toBe('22K');
    expect(fieldText(LabelField.PIECES, DATA)).toBe('1 pc');
    expect(fieldText(LabelField.HALLMARK, DATA)).toBe('HUID HUID123');
  });

  it('PRICE_TEXT is a static marker, never a number', () => {
    const t = fieldText(LabelField.PRICE_TEXT, DATA);
    expect(t).toBe('rate-based');
    expect(/\d/.test(t)).toBe(false);
  });
});

describe('mmToDots', () => {
  it('converts at 203 and 300 dpi', () => {
    expect(mmToDots(25.4, 203)).toBe(203);
    expect(mmToDots(25.4, 300)).toBe(300);
    expect(mmToDots(10, 203)).toBe(80); // 10mm ≈ 79.9 dots
  });
});
