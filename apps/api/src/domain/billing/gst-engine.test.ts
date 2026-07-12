import { describe, expect, it } from 'vitest';
import { ComponentType, GstSplit, InvoiceMode, MaterialForm } from '@erp/shared';
import { computeGst, TaxConfigError, type GstLineInput } from './gst-engine';
import type { TaxRuleRow } from '../tax/resolve-tax-rule';

const FROM = new Date('2026-01-01');
const AT = new Date('2026-07-01');

/** The seeded 2026 India matrix (TAX_INVOICE mode). */
const MATRIX: TaxRuleRow[] = [
  { id: 'm', componentType: ComponentType.METAL, form: MaterialForm.JEWELLERY, isSetInJewellery: false, invoiceMode: InvoiceMode.TAX_INVOICE, rateBps: 300, hsnCodeId: null, effectiveFrom: FROM, effectiveTo: null },
  { id: 'mk', componentType: ComponentType.MAKING, form: MaterialForm.SERVICE, isSetInJewellery: false, invoiceMode: InvoiceMode.TAX_INVOICE, rateBps: 500, hsnCodeId: null, effectiveFrom: FROM, effectiveTo: null },
  { id: 'sset', componentType: ComponentType.STONE, form: MaterialForm.LOOSE_POLISHED, isSetInJewellery: true, invoiceMode: InvoiceMode.TAX_INVOICE, rateBps: 300, hsnCodeId: null, effectiveFrom: FROM, effectiveTo: null },
  { id: 'sloose', componentType: ComponentType.STONE, form: MaterialForm.LOOSE_POLISHED, isSetInJewellery: false, invoiceMode: InvoiceMode.TAX_INVOICE, rateBps: 150, hsnCodeId: null, effectiveFrom: FROM, effectiveTo: null },
  { id: 'studded', componentType: ComponentType.ITEM, form: MaterialForm.JEWELLERY, isSetInJewellery: true, invoiceMode: InvoiceMode.TAX_INVOICE, rateBps: 300, hsnCodeId: null, effectiveFrom: FROM, effectiveTo: null },
  { id: 'imit', componentType: ComponentType.ITEM, form: MaterialForm.IMITATION, isSetInJewellery: false, invoiceMode: InvoiceMode.TAX_INVOICE, rateBps: 1800, hsnCodeId: null, effectiveFrom: FROM, effectiveTo: null },
];

const plainLine = (over: Partial<GstLineInput> = {}): GstLineInput => ({
  lineNo: 1,
  metalValuePaise: 10_000_000, // ₹1,00,000 metal
  stoneValuePaise: 0,
  makingPaise: 1_000_000, // ₹10,000 making
  lineDiscountPaise: 0,
  isStudded: false,
  isPrecious: true,
  ...over,
});

const base = { matrix: MATRIX, sellerStateCode: '27', placeOfSupplyStateCode: '27', exchangeValuePaise: 0, at: AT };

describe('GST engine — itemized plain jewellery (rule 1)', () => {
  it('3% on metal + 5% on making, CGST/SGST halves intra-state', () => {
    const r = computeGst({ invoiceMode: InvoiceMode.TAX_INVOICE, lines: [plainLine()], ...base });
    // metal 3% = ₹3,000 = 300,000 p; making 5% = ₹500 = 50,000 p
    expect(r.totalTaxPaise).toBe(350_000);
    expect(r.grandTotalPaise).toBe(11_000_000 + 350_000);
    expect(r.gstSplit).toBe(GstSplit.INTRA_STATE);
    const labels = r.taxBuckets.map((b) => `${b.label}:${b.taxPaise}`);
    expect(labels).toContain('CGST 2.5%:25000'); // half of 5% making tax
    expect(labels).toContain('SGST 2.5%:25000');
    expect(labels).toContain('CGST 1.5%:150000'); // half of 3% metal tax
    expect(labels).toContain('SGST 1.5%:150000');
    // reconciliation: bucket taxes sum to total
    expect(r.taxBuckets.reduce((s, b) => s + b.taxPaise, 0)).toBe(r.totalTaxPaise);
  });

  it('inter-state produces single IGST buckets', () => {
    const r = computeGst({ invoiceMode: InvoiceMode.TAX_INVOICE, lines: [plainLine()], ...base, placeOfSupplyStateCode: '29' });
    expect(r.gstSplit).toBe(GstSplit.INTER_STATE);
    expect(r.taxBuckets.map((b) => b.label).sort()).toEqual(['IGST 3%', 'IGST 5%']);
    expect(r.totalTaxPaise).toBe(350_000);
  });
});

describe('composite studded rule (rule 2)', () => {
  it('taxes the whole line (incl. making) at 3%', () => {
    const r = computeGst({
      invoiceMode: InvoiceMode.TAX_INVOICE,
      lines: [plainLine({ isStudded: true, stoneValuePaise: 5_000_000 })],
      ...base,
    });
    // total 1,60,000 → 3% = ₹4,800 = 480,000 p (no 5% making split)
    expect(r.totalTaxPaise).toBe(480_000);
    expect(new Set(r.taxBuckets.map((b) => b.rateBps))).toEqual(new Set([300]));
  });
});

describe('imitation rule (rule 3)', () => {
  it('taxes the whole item at 18%', () => {
    const r = computeGst({
      invoiceMode: InvoiceMode.TAX_INVOICE,
      lines: [plainLine({ isPrecious: false, metalValuePaise: 100_000, makingPaise: 0 })],
      ...base,
    });
    expect(r.totalTaxPaise).toBe(18_000);
  });
});

describe('old-gold exchange (rule 6): GST on value addition only', () => {
  it('reduces the taxable base by the exchange credit', () => {
    const r = computeGst({
      invoiceMode: InvoiceMode.TAX_INVOICE,
      lines: [plainLine({ makingPaise: 0 })], // ₹1,00,000 metal only
      ...base,
      exchangeValuePaise: 6_000_000, // ₹60,000 old gold
    });
    expect(r.taxableValuePaise).toBe(4_000_000); // addition = ₹40,000
    expect(r.totalTaxPaise).toBe(120_000); // 3% of ₹40,000 = ₹1,200
    expect(r.grandTotalPaise).toBe(4_120_000); // customer pays ₹41,200
  });

  it('caps the credit at document value with a warning', () => {
    const r = computeGst({
      invoiceMode: InvoiceMode.TAX_INVOICE,
      lines: [plainLine({ metalValuePaise: 1_000_000, makingPaise: 0 })],
      ...base,
      exchangeValuePaise: 2_000_000,
    });
    expect(r.taxableValuePaise).toBe(0);
    expect(r.totalTaxPaise).toBe(0);
    expect(r.warnings.some((w) => w.includes('capped'))).toBe(true);
  });
});

describe('kaccha documents (rule 7)', () => {
  it('estimate carries zero GST', () => {
    const r = computeGst({ invoiceMode: InvoiceMode.ESTIMATE, lines: [plainLine()], ...base });
    expect(r.totalTaxPaise).toBe(0);
    expect(r.taxBuckets).toEqual([]);
    expect(r.grandTotalPaise).toBe(11_000_000);
  });
});

describe('mixed-supply guard (rule 5)', () => {
  it('bundled single price → whole line at highest rate', () => {
    const r = computeGst({
      invoiceMode: InvoiceMode.TAX_INVOICE,
      lines: [plainLine({ bundledSinglePrice: true })],
      ...base,
    });
    // metal ₹1,00,000 @3% would be 3,000; making ₹10,000 @5% = 500.
    // Bundled: whole ₹1,10,000 at 5% = ₹5,500 = 550,000 p
    expect(r.totalTaxPaise).toBe(550_000);
    expect(r.warnings.some((w) => w.includes('mixed supply'))).toBe(true);
  });

  it('itemized lines are NOT bundled (normal path)', () => {
    const r = computeGst({ invoiceMode: InvoiceMode.TAX_INVOICE, lines: [plainLine()], ...base });
    expect(r.warnings).toEqual([]);
  });
});

describe('discount proration', () => {
  it('cart discount reduces taxable value before tax', () => {
    const r = computeGst({
      invoiceMode: InvoiceMode.TAX_INVOICE,
      lines: [plainLine({ lineDiscountPaise: 1_100_000 })], // 10% off ₹1,10,000
      ...base,
    });
    expect(r.taxableValuePaise).toBe(9_900_000);
    // metal taxed on 10,000,000×(1-0.1)=9,000,000 → 270,000; making on 900,000 → 45,000
    expect(r.totalTaxPaise).toBe(315_000);
  });
});

describe('configuration errors', () => {
  it('missing rule throws TaxConfigError — never silent 0%', () => {
    expect(() =>
      computeGst({ invoiceMode: InvoiceMode.TAX_INVOICE, lines: [plainLine()], ...base, matrix: [] }),
    ).toThrow(TaxConfigError);
  });
});

describe('paise reconciliation', () => {
  it('CGST+SGST equals the full-rate tax even on odd paise', () => {
    const r = computeGst({
      invoiceMode: InvoiceMode.TAX_INVOICE,
      lines: [plainLine({ metalValuePaise: 33_333, makingPaise: 0 })],
      ...base,
    });
    // 3% of 33,333 = 999.99 → 1000 (half-up); halves 500+500
    expect(r.totalTaxPaise).toBe(1_000);
    const cgst = r.taxBuckets.find((b) => b.kind === 'CGST')!.taxPaise;
    const sgst = r.taxBuckets.find((b) => b.kind === 'SGST')!.taxPaise;
    expect(cgst + sgst).toBe(1_000);
  });
});
