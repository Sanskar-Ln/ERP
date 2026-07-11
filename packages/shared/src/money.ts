/**
 * Money math in integer paise (INR minor unit; ₹1 = 100 paise).
 *
 * BUSINESS RULE: money is NEVER represented as an IEEE float anywhere in the
 * system. All amounts are integers in paise; percentage rates are integers in
 * basis points (bps, 1 bp = 0.01%), so e.g. GST 3% = 300 bps and the odd
 * diamond rate 0.25% = 25 bps is still exact.
 *
 * Rounding: statutory Indian invoices round per tax line, half-up, to the
 * paise. `allocate` distributes a total across parts without losing a paise
 * (largest-remainder method) so line sums always reconcile to the total.
 */

/** An amount in integer paise. Type alias for documentation purposes. */
export type Paise = number;

/** Basis points (1/100 of a percent). 300 = 3%, 25 = 0.25%. */
export type Bps = number;

/** Maximum safely representable paise (Number.MAX_SAFE_INTEGER). ~₹90 trillion. */
export const MAX_PAISE = Number.MAX_SAFE_INTEGER;

/**
 * Assert a value is a safe integer paise amount.
 * Throws on floats/NaN/overflow — catching float leakage early is the point.
 */
export function assertPaise(value: number, label = 'amount'): Paise {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of paise, got ${value}`);
  }
  return value;
}

/** Sum paise amounts with overflow checking. */
export function addPaise(...amounts: Paise[]): Paise {
  let total = 0;
  for (const a of amounts) {
    total += assertPaise(a);
    assertPaise(total, 'sum');
  }
  return total;
}

/**
 * Apply a basis-point rate to an amount, rounding half-up to the paise.
 * Used for GST: `applyBps(metalValue, 300)` = 3% GST on metal.
 *
 * Implementation detail: computed in scaled integer space
 * (amount * bps / 10000) with explicit half-up rounding — no floats.
 */
export function applyBps(amount: Paise, rateBps: Bps): Paise {
  assertPaise(amount);
  if (!Number.isSafeInteger(rateBps) || rateBps < 0) {
    throw new RangeError(`rateBps must be a non-negative integer, got ${rateBps}`);
  }
  // Use BigInt for the intermediate product to avoid overflow on large invoices.
  const scaled = BigInt(amount) * BigInt(rateBps);
  const q = scaled / 10000n;
  const r = scaled % 10000n;
  const rounded = r * 2n >= 10000n ? q + 1n : q;
  return assertPaise(Number(rounded), 'applyBps result');
}

/**
 * Split `rateBps` in half for CGST/SGST, without losing a paise:
 * computes tax on the full rate, then allocates it into two halves
 * (first half gets the odd paise). BUSINESS RULE: CGST + SGST must equal
 * the tax at the full rate exactly.
 */
export function splitHalves(taxTotal: Paise): [Paise, Paise] {
  assertPaise(taxTotal);
  const first = Math.ceil(taxTotal / 2);
  return [first, taxTotal - first];
}

/**
 * Allocate `total` across `weights` proportionally without losing a paise
 * (largest-remainder / Hamilton method). Used to prorate discounts or
 * exchange value across invoice lines.
 *
 * @param total   amount to distribute (paise)
 * @param weights relative weights (any non-negative integers, e.g. line values)
 * @returns per-weight allocations summing exactly to `total`
 */
export function allocate(total: Paise, weights: number[]): Paise[] {
  assertPaise(total);
  if (weights.length === 0) throw new RangeError('allocate needs at least one weight');
  const weightSum = weights.reduce((s, w) => {
    if (!Number.isFinite(w) || w < 0) throw new RangeError(`invalid weight ${w}`);
    return s + w;
  }, 0);
  if (weightSum === 0) {
    // Degenerate case: spread evenly, remainder to the first lines.
    const base = Math.floor(total / weights.length);
    let rem = total - base * weights.length;
    return weights.map(() => base + (rem-- > 0 ? 1 : 0));
  }
  const shares = weights.map((w) => (BigInt(total) * BigInt(Math.round(w * 1000))) / BigInt(Math.round(weightSum * 1000)));
  const floors = shares.map((s) => Number(s));
  let remainder = total - floors.reduce((s, f) => s + f, 0);
  // Distribute the leftover paise to the largest fractional remainders.
  const fracs = weights
    .map((w, i) => ({ i, frac: (total * w) / weightSum - floors[i]! }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; remainder > 0; k = (k + 1) % fracs.length, remainder--) {
    out[fracs[k]!.i]! += 1;
  }
  return out;
}

/** Multiply a unit price (paise) by an integer quantity, overflow-checked. */
export function timesQty(unitPaise: Paise, qty: number): Paise {
  assertPaise(unitPaise, 'unitPaise');
  if (!Number.isSafeInteger(qty) || qty < 0) throw new RangeError(`qty must be a non-negative integer, got ${qty}`);
  return assertPaise(unitPaise * qty, 'timesQty result');
}

/**
 * Format paise for display as INR with the Indian digit-grouping
 * (e.g. 12345678900 → "₹12,34,56,789.00"). Display-only; never parse this back.
 */
export function formatPaise(amount: Paise): string {
  assertPaise(amount);
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const rupees = Math.floor(abs / 100);
  const paise = abs % 100;
  // Indian grouping: last 3 digits, then groups of 2.
  const s = rupees.toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
  return `${sign}₹${grouped}.${paise.toString().padStart(2, '0')}`;
}

/** Parse a decimal rupee string (e.g. "1234.50") into paise. Rejects >2 dp. */
export function rupeesToPaise(rupees: string): Paise {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(rupees.trim());
  if (!m) throw new RangeError(`invalid rupee amount: "${rupees}"`);
  const sign = m[1] === '-' ? -1 : 1;
  const whole = Number(m[2]);
  const frac = m[3] ? Number(m[3].padEnd(2, '0')) : 0;
  return assertPaise(sign * (whole * 100 + frac), 'parsed amount');
}
