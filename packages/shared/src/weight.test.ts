import { describe, expect, it } from 'vitest';
import {
  caratsToMct,
  chargeableMgWithWastage,
  fineMg,
  gramsToMg,
  karatToFineness,
  mctToCarats,
  mctToMg,
  metalValuePaise,
  mgToGrams,
  netMetalMg,
  rattiToMct,
  roundDiv,
} from './weight';

describe('gram/mg round-trips', () => {
  it('parses 3dp grams', () => expect(gramsToMg('12.345')).toBe(12_345));
  it('parses short decimals', () => expect(gramsToMg('12.3')).toBe(12_300));
  it('formats canonically', () => expect(mgToGrams(12_345)).toBe('12.345'));
  it('rejects floats masquerading as strings', () => expect(() => gramsToMg('12.3456')).toThrow());
});

describe('carat/ratti conversions', () => {
  it('carats to millicarats', () => expect(caratsToMct('1.255')).toBe(1255));
  it('mct back to carats', () => expect(mctToCarats(1255)).toBe('1.255'));
  it('ratti convention 1 ratti = 0.91 ct', () => expect(rattiToMct('1')).toBe(910));
  it('fractional ratti', () => expect(rattiToMct('2.25')).toBe(2048)); // 2.25*910 = 2047.5 → 2048
  it('1 ct = 200 mg', () => expect(mctToMg(1000)).toBe(200));
});

describe('net / fine / wastage math', () => {
  it('net = gross − stones − deductions', () => {
    // 10.000 g gross, 2.500 ct stones (= 0.500 g), 0.100 g lac
    expect(netMetalMg(10_000, 2_500, 100)).toBe(9_400);
  });
  it('negative net throws', () => expect(() => netMetalMg(100, 5_000)).toThrow());
  it('fine weight at 22K/916', () => expect(fineMg(10_000, 916)).toBe(9_160));
  it('fine weight rounds half-up', () => expect(fineMg(9_999, 916)).toBe(9_159)); // 9159.084
  it('8% wastage on 10g bills 10.8g', () => expect(chargeableMgWithWastage(10_000, 800)).toBe(10_800));
});

describe('metal value', () => {
  it('10 g at ₹75,000/10g = ₹75,000', () => {
    expect(metalValuePaise(10_000, 7_500_000)).toBe(7_500_000);
  });
  it('9.4 g at ₹75,000/10g = ₹70,500', () => {
    expect(metalValuePaise(9_400, 7_500_000)).toBe(7_050_000);
  });
  it('rounds half-up to paise', () => {
    // 1 mg at ₹75,000/10g = 750 paise/1000mg... 1mg = 0.75 paise → 1
    expect(metalValuePaise(1, 7_500_000)).toBe(750);
    expect(metalValuePaise(1, 5)).toBe(0); // 0.0005 paise → 0
  });
});

describe('helpers', () => {
  it('roundDiv half-up', () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(-5, 2)).toBe(-2); // floor-based: -2.5 → -2 (half-up toward +∞)
  });
  it('karat table', () => {
    expect(karatToFineness(22)).toBe(916);
    expect(karatToFineness(18)).toBe(750);
    expect(() => karatToFineness(21)).toThrow();
  });
});
