import { describe, expect, it } from 'vitest';
import { MakingChargeType } from '@erp/shared';
import { oldGoldValuePaise, priceItem } from './price-item';

// 10.000 g net 22K at ₹92,000/10g board rate
const GOLD_22K_RATE = 9_200_000; // paise per 10 g

describe('priceItem', () => {
  it('plain ring: metal with wastage + per-gram making', () => {
    const p = priceItem({
      pieces: 1,
      metalComponents: [{ netWeightMg: 10_000, wastageBps: 800, ratePaisePer10g: GOLD_22K_RATE }],
      stoneValuesPaise: [],
      making: { type: MakingChargeType.PER_GRAM, value: 45_000 }, // ₹450/g
      makingDiscountPaise: 0,
    });
    // chargeable = 10.800 g → 10800 × 9200000 / 10000 = 99,36,000 paise (₹99,360)
    expect(p.totalChargeableMg).toBe(10_800);
    expect(p.metalValuePaise).toBe(9_936_000);
    // making on NET weight: 45000 × 10000/1000 = 450,000 paise (₹4,500)
    expect(p.makingPaise).toBe(450_000);
    expect(p.grossPaise).toBe(10_386_000);
  });

  it('FLAT making multiplies by pieces', () => {
    const p = priceItem({
      pieces: 4,
      metalComponents: [],
      stoneValuesPaise: [],
      making: { type: MakingChargeType.FLAT, value: 25_000 },
      makingDiscountPaise: 0,
    });
    expect(p.makingPaise).toBe(100_000);
  });

  it('PERCENT_OF_METAL making uses the wastage-inclusive metal value', () => {
    const p = priceItem({
      pieces: 1,
      metalComponents: [{ netWeightMg: 10_000, wastageBps: 0, ratePaisePer10g: GOLD_22K_RATE }],
      stoneValuesPaise: [],
      making: { type: MakingChargeType.PERCENT_OF_METAL, value: 1_000 }, // 10%
      makingDiscountPaise: 0,
    });
    expect(p.metalValuePaise).toBe(9_200_000);
    expect(p.makingPaise).toBe(920_000);
  });

  it('making discount floors at zero and never rebates metal', () => {
    const p = priceItem({
      pieces: 1,
      metalComponents: [{ netWeightMg: 1_000, wastageBps: 0, ratePaisePer10g: GOLD_22K_RATE }],
      stoneValuesPaise: [],
      making: { type: MakingChargeType.FLAT, value: 10_000 },
      makingDiscountPaise: 99_999,
    });
    expect(p.makingPaise).toBe(0);
    expect(p.makingDiscountAppliedPaise).toBe(10_000);
    expect(p.grossPaise).toBe(p.metalValuePaise);
  });

  it('stones add their recorded values', () => {
    const p = priceItem({
      pieces: 1,
      metalComponents: [],
      stoneValuesPaise: [5_000_000, 250_000],
      making: { type: MakingChargeType.FLAT, value: 0 },
      makingDiscountPaise: 0,
    });
    expect(p.stoneValuePaise).toBe(5_250_000);
  });

  it('old-gold valuation: 9.4 g net at ₹88,000/10g', () => {
    expect(oldGoldValuePaise(9_400, 8_800_000)).toBe(8_272_000);
  });
});
