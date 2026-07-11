/**
 * Stock-movement rules — PURE domain logic.
 *
 * The stock ledger is append-only and dual-unit: every movement carries a
 * signed piece count AND a signed gross weight. Stock on hand is the SUM of
 * a ledger slice, never a mutable counter — the same design as a financial
 * ledger, which is what makes reversals and audits trivially correct.
 */
import { MovementType } from '@erp/shared';

/**
 * Direction of each movement type: +1 adds stock to the branch, −1 removes.
 * REVERSAL is special-cased: its sign is the negation of the movement it
 * reverses, computed by `reversalOf`.
 */
const SIGNS: Record<MovementType, 1 | -1 | 0> = {
  PURCHASE_IN: 1,
  SALE_OUT: -1,
  TRANSFER_OUT: -1,
  TRANSFER_IN: 1,
  ADJUSTMENT: 0, // sign comes from the posted quantities themselves
  EXCHANGE_IN: 1,
  KARIGAR_ISSUE: -1,
  KARIGAR_RECEIPT: 1,
  REVERSAL: 0, // quantities are copied negated from the original
};

/** Sign convention for a movement type (see SIGNS). */
export const signForMovement = (type: MovementType): 1 | -1 | 0 => SIGNS[type];

/**
 * Normalize posted quantities to the ledger convention: magnitudes are
 * always ≥ 0 in the API payload; the ledger stores them signed.
 * ADJUSTMENT accepts caller-signed quantities as-is (count corrections go
 * both ways); everything else takes its sign from the movement type.
 */
export function signedQuantities(
  type: MovementType,
  pieces: number,
  grossWeightMg: number,
): { pieces: number; grossWeightMg: number } {
  if (!Number.isSafeInteger(pieces)) throw new RangeError(`pieces must be an integer, got ${pieces}`);
  if (!Number.isSafeInteger(grossWeightMg)) throw new RangeError(`grossWeightMg must be an integer, got ${grossWeightMg}`);
  const sign = signForMovement(type);
  if (sign === 0) return { pieces, grossWeightMg }; // ADJUSTMENT / REVERSAL: as posted
  const abs = (n: number) => Math.abs(n);
  return { pieces: sign * abs(pieces), grossWeightMg: sign * abs(grossWeightMg) };
}

/**
 * Build the REVERSAL row quantities for an original movement: exact
 * negation of BOTH units, so the ledger nets to zero.
 * IMMUTABILITY RULE: this is the ONLY way to undo a movement.
 */
export function reversalOf(original: { pieces: number; grossWeightMg: number }): {
  pieces: number;
  grossWeightMg: number;
} {
  return { pieces: -original.pieces, grossWeightMg: -original.grossWeightMg };
}
