import { describe, expect, it } from 'vitest';
import { resolveTaxRule, type TaxRuleRow } from './resolve-tax-rule';
import { ComponentType, InvoiceMode, MaterialForm } from '@erp/shared';

const d = (s: string) => new Date(s);

const rule = (over: Partial<TaxRuleRow>): TaxRuleRow => ({
  id: over.id ?? 'r',
  componentType: ComponentType.METAL,
  form: MaterialForm.JEWELLERY,
  isSetInJewellery: false,
  invoiceMode: InvoiceMode.TAX_INVOICE,
  rateBps: 300,
  hsnCodeId: null,
  effectiveFrom: d('2020-01-01'),
  effectiveTo: null,
  ...over,
});

describe('resolveTaxRule', () => {
  it('matches on the exact 4-dimension key', () => {
    const matrix = [
      rule({ id: 'metal-3', componentType: ComponentType.METAL, rateBps: 300 }),
      rule({ id: 'making-5', componentType: ComponentType.MAKING, form: MaterialForm.SERVICE, rateBps: 500 }),
    ];
    const hit = resolveTaxRule(
      matrix,
      {
        componentType: ComponentType.MAKING,
        form: MaterialForm.SERVICE,
        isSetInJewellery: false,
        invoiceMode: InvoiceMode.TAX_INVOICE,
      },
      d('2026-01-01'),
    );
    expect(hit?.id).toBe('making-5');
  });

  it('distinguishes loose vs set stones (1.5% vs jewellery-set)', () => {
    const matrix = [
      rule({ id: 'loose', componentType: ComponentType.STONE, form: MaterialForm.LOOSE_POLISHED, rateBps: 150 }),
      rule({
        id: 'set',
        componentType: ComponentType.STONE,
        form: MaterialForm.LOOSE_POLISHED,
        isSetInJewellery: true,
        rateBps: 300,
      }),
    ];
    const loose = resolveTaxRule(
      matrix,
      { componentType: ComponentType.STONE, form: MaterialForm.LOOSE_POLISHED, isSetInJewellery: false, invoiceMode: InvoiceMode.TAX_INVOICE },
      d('2026-01-01'),
    );
    expect(loose?.rateBps).toBe(150);
  });

  it('honours effective windows: from ≤ at < to', () => {
    const matrix = [
      rule({ id: 'old', rateBps: 300, effectiveFrom: d('2020-01-01'), effectiveTo: d('2026-04-01') }),
      rule({ id: 'new', rateBps: 500, effectiveFrom: d('2026-04-01') }),
    ];
    expect(resolveTaxRule(matrix, matrix[0]!, d('2026-03-31'))?.id).toBe('old');
    expect(resolveTaxRule(matrix, matrix[0]!, d('2026-04-01'))?.id).toBe('new');
  });

  it('latest effectiveFrom wins on overlap (correction rows)', () => {
    const matrix = [
      rule({ id: 'orig', rateBps: 300, effectiveFrom: d('2025-01-01') }),
      rule({ id: 'fix', rateBps: 350, effectiveFrom: d('2025-06-01') }),
    ];
    expect(resolveTaxRule(matrix, matrix[0]!, d('2026-01-01'))?.id).toBe('fix');
  });

  it('returns null (config error), never a silent 0%', () => {
    expect(
      resolveTaxRule([], {
        componentType: ComponentType.ITEM,
        form: MaterialForm.IMITATION,
        isSetInJewellery: false,
        invoiceMode: InvoiceMode.TAX_INVOICE,
      }, d('2026-01-01')),
    ).toBeNull();
  });
});
