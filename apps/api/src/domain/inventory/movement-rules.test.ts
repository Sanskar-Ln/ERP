import { describe, expect, it } from 'vitest';
import { MovementType } from '@erp/shared';
import { reversalOf, signForMovement, signedQuantities } from './movement-rules';

describe('movement sign rules', () => {
  it('in-movements are positive, out-movements negative', () => {
    expect(signForMovement(MovementType.PURCHASE_IN)).toBe(1);
    expect(signForMovement(MovementType.EXCHANGE_IN)).toBe(1);
    expect(signForMovement(MovementType.SALE_OUT)).toBe(-1);
    expect(signForMovement(MovementType.TRANSFER_OUT)).toBe(-1);
    expect(signForMovement(MovementType.KARIGAR_ISSUE)).toBe(-1);
  });

  it('forces the sign regardless of how the caller posted magnitudes', () => {
    expect(signedQuantities(MovementType.SALE_OUT, 2, 10_000)).toEqual({ pieces: -2, grossWeightMg: -10_000 });
    expect(signedQuantities(MovementType.SALE_OUT, -2, -10_000)).toEqual({ pieces: -2, grossWeightMg: -10_000 });
    expect(signedQuantities(MovementType.PURCHASE_IN, -1, -500)).toEqual({ pieces: 1, grossWeightMg: 500 });
  });

  it('ADJUSTMENT keeps caller-signed quantities (corrections go both ways)', () => {
    expect(signedQuantities(MovementType.ADJUSTMENT, -1, -2_000)).toEqual({ pieces: -1, grossWeightMg: -2_000 });
    expect(signedQuantities(MovementType.ADJUSTMENT, 1, 2_000)).toEqual({ pieces: 1, grossWeightMg: 2_000 });
  });

  it('reversal exactly negates both units so the ledger nets to zero', () => {
    const original = { pieces: -3, grossWeightMg: -30_000 };
    const rev = reversalOf(original);
    expect(rev).toEqual({ pieces: 3, grossWeightMg: 30_000 });
    expect(original.pieces + rev.pieces).toBe(0);
    expect(original.grossWeightMg + rev.grossWeightMg).toBe(0);
  });

  it('rejects non-integer quantities (float leak guard)', () => {
    expect(() => signedQuantities(MovementType.PURCHASE_IN, 1.5, 0)).toThrow(RangeError);
    expect(() => signedQuantities(MovementType.PURCHASE_IN, 1, 10.5)).toThrow(RangeError);
  });
});
