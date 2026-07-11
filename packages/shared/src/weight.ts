/**
 * Weight & purity math in fixed-point integers — never floats.
 *
 * Units:
 * - Metal weights: integer MILLIGRAMS internally, transported as gram
 *   strings with exactly 3 decimals ("12.345"). 1 g = 1000 mg.
 * - Stone weights: integer MILLICARATS (1 ct = 1000 mct), transported as
 *   carat strings with up to 3 decimals — diamond trade quotes to 3 dp.
 * - Ratti: traditional Indian unit for coloured stones. Convention used
 *   here (configurable at call sites): 1 ratti = 0.91 carat = 910 mct.
 * - Purity/fineness: parts per thousand (‰) as integers — 22K = 916,
 *   18K = 750, silver sterling = 925, chuddi gold 999.
 *
 * BUSINESS RULE: gross − stone − other deductions = net metal weight; fine
 * weight = net × fineness/1000 (rounded to mg, half-up). Wastage (karigar
 * loss allowance) is quoted in basis points of net weight.
 */

/** Integer milligrams. */
export type Mg = number;
/** Integer millicarats (1 carat = 1000 mct). */
export type Mct = number;

/** Default ratti→carat convention (1 ratti = 0.91 ct). Stored as millicarats. */
export const MCT_PER_RATTI = 910;

/** 1 carat = 200 mg exactly (metric carat) — used to add stone weight into gross grams. */
export const MG_PER_CARAT = 200;

function assertInt(v: number, label: string): number {
  if (!Number.isSafeInteger(v)) throw new RangeError(`${label} must be a safe integer, got ${v}`);
  return v;
}

/**
 * Parse a fixed-point decimal string into integer units.
 * @param value   decimal string, e.g. "12.345"
 * @param scale   number of decimal places of the target unit (3 for mg/mct)
 */
function parseFixed(value: string, scale: number, label: string): number {
  const m = new RegExp(`^(-?)(\\d+)(?:\\.(\\d{1,${scale}}))?$`).exec(value.trim());
  if (!m) throw new RangeError(`invalid ${label}: "${value}"`);
  const sign = m[1] === '-' ? -1 : 1;
  const frac = (m[3] ?? '').padEnd(scale, '0');
  return assertInt(sign * (Number(m[2]) * 10 ** scale + Number(frac)), label);
}

function formatFixed(units: number, scale: number): string {
  assertInt(units, 'fixed-point value');
  const sign = units < 0 ? '-' : '';
  const abs = Math.abs(units);
  const whole = Math.floor(abs / 10 ** scale);
  const frac = (abs % 10 ** scale).toString().padStart(scale, '0');
  return `${sign}${whole}.${frac}`;
}

/** Parse a gram string ("12.345", max 3 dp) into integer milligrams. */
export const gramsToMg = (grams: string): Mg => parseFixed(grams, 3, 'gram weight');

/** Format integer milligrams as a canonical 3-dp gram string. */
export const mgToGrams = (mg: Mg): string => formatFixed(mg, 3);

/** Parse a carat string ("1.255", max 3 dp) into integer millicarats. */
export const caratsToMct = (carats: string): Mct => parseFixed(carats, 3, 'carat weight');

/** Format integer millicarats as a canonical 3-dp carat string. */
export const mctToCarats = (mct: Mct): string => formatFixed(mct, 3);

/** Convert ratti (string, up to 2 dp) to millicarats using the 0.91 ct convention. */
export function rattiToMct(ratti: string, mctPerRatti: number = MCT_PER_RATTI): Mct {
  const centiRatti = parseFixed(ratti, 2, 'ratti weight');
  return roundDiv(centiRatti * mctPerRatti, 100);
}

/** Convert millicarats to milligrams (1 ct = 200 mg exact), half-up to mg. */
export const mctToMg = (mct: Mct): Mg => roundDiv(assertInt(mct, 'mct') * MG_PER_CARAT, 1000);

/** Integer division with half-up rounding (banker-free, statutory style). */
export function roundDiv(numerator: number, denominator: number): number {
  assertInt(numerator, 'numerator');
  assertInt(denominator, 'denominator');
  if (denominator <= 0) throw new RangeError('denominator must be positive');
  const q = Math.floor(numerator / denominator);
  const r = numerator - q * denominator;
  return r * 2 >= denominator ? q + 1 : q;
}

/**
 * Net metal weight = gross − total stone weight (converted to mg) − other
 * deductions (lac/thread/beads etc., in mg).
 * Throws if the result is negative — a tagging/data error, not a valid item.
 */
export function netMetalMg(grossMg: Mg, stoneMct: Mct, otherDeductionsMg: Mg = 0): Mg {
  const stoneMg = roundDiv(assertInt(stoneMct, 'stoneMct') * MG_PER_CARAT, 1000);
  const net = assertInt(grossMg, 'grossMg') - stoneMg - assertInt(otherDeductionsMg, 'otherDeductionsMg');
  if (net < 0) throw new RangeError(`net weight negative: gross=${grossMg}mg stones=${stoneMg}mg other=${otherDeductionsMg}mg`);
  return net;
}

/**
 * Fine (pure) metal content = net × fineness/1000, rounded half-up to mg.
 * @param finenessPpt purity in parts per thousand (22K = 916, 18K = 750)
 */
export function fineMg(netMg: Mg, finenessPpt: number): Mg {
  assertInt(netMg, 'netMg');
  if (!Number.isSafeInteger(finenessPpt) || finenessPpt <= 0 || finenessPpt > 1000) {
    throw new RangeError(`fineness must be 1..1000 ppt, got ${finenessPpt}`);
  }
  return roundDiv(netMg * finenessPpt, 1000);
}

/**
 * Chargeable weight after wastage: net × (1 + wastageBps/10000), rounded to mg.
 *
 * BUSINESS RULE: jewellers bill "wastage" (making loss allowance) as extra
 * metal weight on top of net — e.g. 8% wastage on 10.000 g bills 10.800 g of
 * metal value. Quoted in basis points so 8% = 800 bps.
 */
export function chargeableMgWithWastage(netMg: Mg, wastageBps: number): Mg {
  assertInt(netMg, 'netMg');
  if (!Number.isSafeInteger(wastageBps) || wastageBps < 0) {
    throw new RangeError(`wastageBps must be a non-negative integer, got ${wastageBps}`);
  }
  return netMg + roundDiv(netMg * wastageBps, 10000);
}

/**
 * Metal value in paise for a weight at a rate.
 * @param weightMg    chargeable metal weight in mg
 * @param ratePaisePer10g rate quoted per 10 g (Indian convention), in paise
 */
export function metalValuePaise(weightMg: Mg, ratePaisePer10g: number): number {
  assertInt(weightMg, 'weightMg');
  assertInt(ratePaisePer10g, 'ratePaisePer10g');
  // value = mg × rate / 10 g = mg × rate / 10000 mg, rounded half-up to paise.
  const scaled = BigInt(weightMg) * BigInt(ratePaisePer10g);
  const q = scaled / 10000n;
  const r = scaled % 10000n;
  const rounded = r * 2n >= 10000n ? q + 1n : q;
  const result = Number(rounded);
  assertInt(result, 'metal value');
  return result;
}

/** Karat → fineness ppt for standard karats (24K→999 by trade convention). */
export function karatToFineness(karat: number): number {
  const table: Record<number, number> = { 24: 999, 23: 958, 22: 916, 20: 833, 18: 750, 14: 585, 10: 417, 9: 375 };
  const f = table[karat];
  if (!f) throw new RangeError(`no standard fineness for ${karat}K — configure a custom Purity instead`);
  return f;
}
