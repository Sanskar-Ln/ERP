import { describe, expect, it } from 'vitest';
import { addPaise, allocate, applyBps, assertPaise, formatPaise, rupeesToPaise, splitHalves, timesQty } from './money';

describe('assertPaise', () => {
  it('accepts safe integers', () => expect(assertPaise(123)).toBe(123));
  it('rejects floats', () => expect(() => assertPaise(1.5)).toThrow(RangeError));
  it('rejects NaN and unsafe values', () => {
    expect(() => assertPaise(NaN)).toThrow(RangeError);
    expect(() => assertPaise(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
  });
});

describe('applyBps (GST rates)', () => {
  it('3% of ₹1,00,000 = ₹3,000', () => expect(applyBps(10_000_000, 300)).toBe(300_000));
  it('5% making on ₹12,345.67 rounds half-up', () => {
    // 1234567 * 500 / 10000 = 61728.35 → 61728
    expect(applyBps(1_234_567, 500)).toBe(61_728);
  });
  it('0.25% rough diamond rate stays exact in bps', () => {
    expect(applyBps(40_000_000, 25)).toBe(100_000); // ₹4,00,000 → ₹1,000
  });
  it('rounds .5 up', () => expect(applyBps(50, 100)).toBe(1)); // 0.5 paise → 1
  it('handles large invoices via BigInt intermediate', () => {
    expect(applyBps(9_000_000_000_000, 300)).toBe(270_000_000_000);
  });
});

describe('splitHalves (CGST/SGST)', () => {
  it('even split', () => expect(splitHalves(300_000)).toEqual([150_000, 150_000]));
  it('odd paise goes to CGST, total preserved', () => {
    const [cgst, sgst] = splitHalves(101);
    expect(cgst + sgst).toBe(101);
    expect(cgst).toBe(51);
  });
});

describe('allocate (largest remainder)', () => {
  it('splits proportionally and reconciles exactly', () => {
    const parts = allocate(1000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });
  it('weights by value', () => {
    expect(allocate(100, [75, 25])).toEqual([75, 25]);
  });
  it('zero weights spread evenly', () => {
    expect(allocate(5, [0, 0])).toEqual([3, 2]);
  });
});

describe('formatting & parsing', () => {
  it('Indian digit grouping', () => expect(formatPaise(1_23_45_67_890)).toBe('₹1,23,45,678.90'));
  it('small amounts', () => expect(formatPaise(5)).toBe('₹0.05'));
  it('parses rupees', () => expect(rupeesToPaise('1234.5')).toBe(123_450));
  it('rejects 3dp rupees', () => expect(() => rupeesToPaise('1.005')).toThrow());
  it('timesQty', () => expect(timesQty(9999, 3)).toBe(29_997));
  it('addPaise', () => expect(addPaise(1, 2, 3)).toBe(6));
});
