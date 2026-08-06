import { describe, expect, it } from 'vitest';
import { BarcodeSymbology, LabelField, LabelRegion, TagShape } from '@erp/shared';
import { layoutLabel, type LabelTemplateSpec, type TagLabelData } from '../label-layout';
import { renderZpl, renderZplBatch } from './zpl';
import { renderTspl } from './tspl';
import { renderHtmlSheet } from './html';

const DATA: TagLabelData = {
  tagCode: 'RING-0001#1',
  itemCode: 'RING-0001',
  name: 'Ladies ring',
  category: 'Ring',
  grossWeightG: '12.500',
  netWeightG: '11.800',
  purityLabel: '22K',
  pieces: 1,
  hallmarkNo: null,
};

/** 75×13 dumbbell: barcode + code on the left flag, weight + purity right. */
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

const layout = layoutLabel(DUMBBELL, DATA);

describe('ZPL renderer', () => {
  it('wraps the job and sizes the label in dots at 203 dpi', () => {
    const zpl = renderZpl(layout, 203);
    expect(zpl.startsWith('^XA')).toBe(true);
    expect(zpl.trimEnd().endsWith('^XZ')).toBe(true);
    // 75mm at 203dpi = 599 dots, 13mm = 104 dots
    expect(zpl).toContain('^PW599');
    expect(zpl).toContain('^LL104');
  });

  it('emits a Code128 barcode carrying the price-free payload', () => {
    const zpl = renderZpl(layout, 203);
    expect(zpl).toMatch(/\^BCN,\d+,N,N,N/);
    expect(zpl).toContain('^FDRING-0001#1^FS');
    expect(zpl).not.toMatch(/₹|\bRS\b/i);
  });

  it('places right-flag fields past the neck', () => {
    const zpl = renderZpl(layout, 203);
    // right flag starts at 45mm → 360 dots; the purity text must be there
    const origins = [...zpl.matchAll(/\^FO(\d+),(\d+)/g)].map((m) => Number(m[1]));
    expect(Math.max(...origins)).toBeGreaterThanOrEqual(360);
  });

  it('scales with dpi', () => {
    expect(renderZpl(layout, 300)).toContain('^PW886'); // 75mm @300dpi
  });

  it('strips ZPL control characters from data', () => {
    const evil = layoutLabel(DUMBBELL, { ...DATA, purityLabel: '22K^FS~JA' });
    const zpl = renderZpl(evil, 203);
    expect(zpl).toContain('^FD22K FS JA^FS');
  });

  it('batches many labels into one job', () => {
    const job = renderZplBatch([layout, layout], 203);
    expect(job.match(/\^XA/g)).toHaveLength(2);
  });
});

describe('TSPL renderer', () => {
  it('sets size in mm, clears and prints', () => {
    const t = renderTspl(layout, 203);
    expect(t).toContain('SIZE 75.0 mm,13.0 mm');
    expect(t).toContain('CLS');
    expect(t.trimEnd().endsWith('PRINT 1,1')).toBe(true);
    expect(t).toContain('\r\n'); // TSPL is CRLF-terminated
  });

  it('emits a Code128 barcode with the tag payload', () => {
    const t = renderTspl(layout, 203);
    expect(t).toMatch(/BARCODE \d+,\d+,"128",\d+,0,0,2,4,"RING-0001#1"/);
  });

  it('escapes quotes in text data', () => {
    const q = layoutLabel(DUMBBELL, { ...DATA, purityLabel: '22"K' });
    expect(renderTspl(q, 203)).toContain('\\"');
  });

  it('uses a larger bitmap font for larger point sizes', () => {
    const big = layoutLabel({ ...DUMBBELL, fields: [{ field: LabelField.PURITY, region: LabelRegion.LEFT, fontPt: 12 }] }, DATA);
    expect(renderTspl(big, 203)).toContain('"4"');
  });
});

describe('HTML renderer', () => {
  const uris = new Map([['RING-0001#1', 'data:image/png;base64,AAAA']]);

  it('positions elements in millimetres and embeds the barcode image', () => {
    const html = renderHtmlSheet([{ layout, barcodeDataUris: uris }], 'batch');
    expect(html).toContain('width:75mm;height:13mm');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  it('draws the fold guide over the neck on a dumbbell, hidden in print', () => {
    const html = renderHtmlSheet([{ layout, barcodeDataUris: uris }], 'batch', {
      shape: TagShape.DUMBBELL,
      leftFlagMm: 30,
      neckMm: 15,
    });
    expect(html).toContain('class="neck" style="left:30mm;width:15mm"');
    expect(html).toContain('.neck{display:none}');
  });

  it('escapes text so item names cannot inject markup', () => {
    const evil = layoutLabel({ ...DUMBBELL, fields: [{ field: LabelField.NAME, region: LabelRegion.LEFT, fontPt: 5 }] }, { ...DATA, name: '<script>x</script>' });
    const html = renderHtmlSheet([{ layout: evil, barcodeDataUris: uris }], 'b');
    expect(html).not.toContain('<script>');
  });
});
