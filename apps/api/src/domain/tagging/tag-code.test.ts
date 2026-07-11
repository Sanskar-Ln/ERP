import { describe, expect, it } from 'vitest';
import { assertPriceFreePayload, buildTagCode, parseTagCode } from './tag-code';

describe('tag codes (price-free barcode payloads)', () => {
  it('round-trips itemCode#ordinal', () => {
    const code = buildTagCode('RING-0001', 3);
    expect(code).toBe('RING-0001#3');
    expect(parseTagCode(code)).toEqual({ itemCode: 'RING-0001', ordinal: 3 });
  });

  it('handles hyphens in item codes unambiguously', () => {
    expect(parseTagCode('SET-22K-BRIDAL#12')).toEqual({ itemCode: 'SET-22K-BRIDAL', ordinal: 12 });
  });

  it('rejects invalid item codes and ordinals', () => {
    expect(() => buildTagCode('ring 1', 1)).toThrow(RangeError);
    expect(() => buildTagCode('RING', 0)).toThrow(RangeError);
    expect(() => parseTagCode('NOSEPARATOR')).toThrow(RangeError);
    expect(() => parseTagCode('#1')).toThrow(RangeError);
  });

  it('price-looking payloads are rejected at the render boundary', () => {
    expect(() => assertPriceFreePayload('RING-0001#1')).not.toThrow();
    expect(() => assertPriceFreePayload('₹95000')).toThrow(RangeError);
    expect(() => assertPriceFreePayload('95000.00')).toThrow(RangeError);
  });
});
