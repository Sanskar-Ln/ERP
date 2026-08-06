/**
 * Item pricing — PURE domain logic (no NestJS/Prisma).
 *
 * Computes the sale value of a composite jewellery item from its weight
 * components, the board metal rate, and the making-charge rule. All money
 * in integer paise, all weights in integer milligrams — see @erp/shared.
 *
 * BUSINESS RULES ENCODED:
 * - Metal value = CHARGEABLE weight × rate/10g, where chargeable weight is
 *   net metal weight inflated by the wastage allowance (bps). Wastage is
 *   the trade's making-loss surcharge billed as extra metal, not a fee.
 * - Stones are priced by their recorded value (rate/carat × weight was
 *   fixed at intake; the stored `valuePaise` is authoritative at sale).
 * - Making charge: FLAT per piece / PER_GRAM on net metal weight /
 *   PERCENT_OF_METAL (bps) on the wastage-inclusive metal value.
 * - Extra charges (hallmarking / packing / other) are flat per-piece-set
 *   amounts added to the line gross; for GST they ride the making/service
 *   path (they are ancillary services, not metal).
 * - Negotiated making discount reduces making only, floored at zero —
 *   a discount can waive making but never turns it into a rebate on metal.
 */
import {
  applyBps,
  chargeableMgWithWastage,
  MakingChargeType,
  metalValuePaise,
  roundDiv,
  type Paise,
} from '@erp/shared';

/** One metal component with its resolved rate. */
export interface MetalComponentPricingInput {
  /** net metal weight in integer milligrams */
  netWeightMg: number;
  /** wastage allowance in basis points (800 = 8%) */
  wastageBps: number;
  /** board (or overridden) rate in paise per 10 g for this purity */
  ratePaisePer10g: number;
}

export interface PriceItemInput {
  pieces: number;
  metalComponents: MetalComponentPricingInput[];
  /** recorded stone values, paise (one per stone component) */
  stoneValuesPaise: number[];
  making: { type: MakingChargeType; value: number };
  /** negotiated discount on making charges, paise */
  makingDiscountPaise: Paise;
  /** flat extra charges (hallmark + packing + other), paise — default 0 */
  extraChargesPaise?: Paise;
}

export interface ItemPricing {
  metalValuePaise: Paise;
  stoneValuePaise: Paise;
  /** making before the negotiated discount */
  makingBeforeDiscountPaise: Paise;
  /** making actually charged (≥ 0) */
  makingPaise: Paise;
  makingDiscountAppliedPaise: Paise;
  /** hallmark + packing + other flat charges */
  extraChargesPaise: Paise;
  /** metal + stones + making (after discount) + extra charges */
  grossPaise: Paise;
  /** total net metal weight (mg) — used for per-gram making + snapshots */
  totalNetWeightMg: number;
  /** total chargeable (wastage-inclusive) weight (mg) */
  totalChargeableMg: number;
}

/** Price one item line. Throws RangeError on any non-integer money/weight. */
export function priceItem(input: PriceItemInput): ItemPricing {
  let metalValue = 0;
  let totalNetMg = 0;
  let totalChargeableMg = 0;
  for (const mc of input.metalComponents) {
    const chargeableMg = chargeableMgWithWastage(mc.netWeightMg, mc.wastageBps);
    metalValue += metalValuePaise(chargeableMg, mc.ratePaisePer10g);
    totalNetMg += mc.netWeightMg;
    totalChargeableMg += chargeableMg;
  }

  const stoneValue = input.stoneValuesPaise.reduce((s, v) => {
    if (!Number.isSafeInteger(v) || v < 0) throw new RangeError(`invalid stone value ${v}`);
    return s + v;
  }, 0);

  let makingBefore: number;
  switch (input.making.type) {
    case MakingChargeType.FLAT:
      // paise per piece
      makingBefore = input.making.value * input.pieces;
      break;
    case MakingChargeType.PER_GRAM:
      // paise per gram on NET metal weight (trade convention: labour is
      // quoted on the metal actually in the piece, not on wastage)
      makingBefore = roundDiv(input.making.value * totalNetMg, 1000);
      break;
    case MakingChargeType.PERCENT_OF_METAL:
      // bps of the wastage-inclusive metal value
      makingBefore = applyBps(metalValue, input.making.value);
      break;
  }

  const discountApplied = Math.min(input.makingDiscountPaise, makingBefore);
  const making = makingBefore - discountApplied;

  const extraCharges = input.extraChargesPaise ?? 0;
  if (!Number.isSafeInteger(extraCharges) || extraCharges < 0) {
    throw new RangeError(`invalid extra charges ${extraCharges}`);
  }

  return {
    metalValuePaise: metalValue,
    stoneValuePaise: stoneValue,
    makingBeforeDiscountPaise: makingBefore,
    makingPaise: making,
    makingDiscountAppliedPaise: discountApplied,
    extraChargesPaise: extraCharges,
    grossPaise: metalValue + stoneValue + making + extraCharges,
    totalNetWeightMg: totalNetMg,
    totalChargeableMg,
  };
}

/**
 * Old-gold exchange valuation: net weight × assessed rate.
 * BUSINESS RULE: the counter assesses purity and applies a rate (usually
 * board rate less a melt margin); value = netMg × rate/10g, half-up paise.
 */
export function oldGoldValuePaise(netWeightMg: number, ratePaisePer10g: number): Paise {
  return metalValuePaise(netWeightMg, ratePaisePer10g);
}
