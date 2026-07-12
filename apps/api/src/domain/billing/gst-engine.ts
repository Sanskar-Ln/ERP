/**
 * GST computation engine — PURE domain logic (no NestJS/Prisma).
 *
 * Given priced lines, the tenant's tax matrix, the two state codes and any
 * old-gold exchange credit, produces the complete tax breakdown of a
 * document. Every rupee figure is integer paise; rates are basis points.
 *
 * BUSINESS RULES ENCODED (India GST, rates read from the MATRIX, not code):
 *
 * 1. ITEMIZED TAXATION (plain precious jewellery): metal value taxed at the
 *    metal rate (3%) and making charges taxed at the service rate (5%)
 *    SHOWN SEPARATELY — the itemized-making treatment per CBIC guidance.
 *    Stones set in plain jewellery ride the jewellery-set stone rule.
 *
 * 2. COMPOSITE STUDDED RULE: studded jewellery (stone set, sold as one
 *    article) is a composite supply — the ENTIRE line value (metal + stone
 *    + making) taxes at the jewellery rate (3%). Making is NOT split out.
 *
 * 3. IMITATION: non-precious items tax as a whole at the imitation rate
 *    (18%, HSN 7117).
 *
 * 4. PLACE OF SUPPLY: seller state == place-of-supply state → CGST+SGST
 *    (two halves of the rate, odd paise to CGST); different → single IGST.
 *
 * 5. MIXED-SUPPLY GUARD (CGST Act §8(b)): components at different rates
 *    priced as ONE bundle (not itemized) — the whole bundle taxes at the
 *    HIGHEST component rate. Applies only when `bundledSinglePrice` is set;
 *    our documents itemize by construction, so this is a guard, not the
 *    normal path.
 *
 * 6. OLD-GOLD EXCHANGE: GST applies to the VALUE ADDITION only — the
 *    exchange credit reduces the taxable base (allocated proportionally
 *    across taxable components) before tax is computed. The customer pays
 *    (new value − old value) + GST on that difference.
 *
 * 7. KACCHA DOCUMENTS: Estimate / Delivery Challan modes carry NO GST —
 *    an estimate is not a supply document; a challan moves goods without
 *    transferring them for consideration.
 */
import {
  allocate,
  applyBps,
  ComponentType,
  GstSplit,
  InvoiceMode,
  MaterialForm,
  splitHalves,
  type Paise,
} from '@erp/shared';
import { resolveTaxRule, type TaxKey, type TaxRuleRow } from '../tax/resolve-tax-rule';

/** A priced line entering the engine (values already discount-adjusted). */
export interface GstLineInput {
  lineNo: number;
  metalValuePaise: Paise;
  stoneValuePaise: Paise;
  makingPaise: Paise;
  /** prorated share of the cart-level discount, paise */
  lineDiscountPaise: Paise;
  /** composite studded article → rule 2 */
  isStudded: boolean;
  /** false → imitation path → rule 3 */
  isPrecious: boolean;
  /** components priced as one non-itemized bundle → rule 5 guard */
  bundledSinglePrice?: boolean;
}

export interface GstEngineInput {
  invoiceMode: InvoiceMode;
  lines: GstLineInput[];
  matrix: readonly TaxRuleRow[];
  sellerStateCode: string;
  placeOfSupplyStateCode: string;
  /** total old-gold credit, paise (rule 6) */
  exchangeValuePaise: Paise;
  /** pricing date for effective-dated rules */
  at: Date;
}

export interface TaxBucket {
  kind: 'CGST' | 'SGST' | 'IGST';
  label: string;
  rateBps: number;
  taxablePaise: Paise;
  taxPaise: Paise;
}

export interface GstResult {
  gstSplit: GstSplit;
  /** line-level taxable value after discount + exchange allocation */
  lineTaxablePaise: Map<number, Paise>;
  taxBuckets: TaxBucket[];
  subtotalPaise: Paise;
  discountPaise: Paise;
  exchangeValuePaise: Paise;
  taxableValuePaise: Paise;
  totalTaxPaise: Paise;
  grandTotalPaise: Paise;
  warnings: string[];
}

/** Thrown when the matrix cannot answer — a tenant config error, never 0%. */
export class TaxConfigError extends Error {
  constructor(key: TaxKey) {
    super(
      `no tax rule for componentType=${key.componentType} form=${key.form} ` +
        `isSetInJewellery=${key.isSetInJewellery} invoiceMode=${key.invoiceMode} — configure the tax matrix`,
    );
    this.name = 'TaxConfigError';
  }
}

/** One taxable component after line decomposition. */
interface TaxableComponent {
  lineNo: number;
  key: TaxKey;
  valuePaise: Paise;
}

/** Decompose a line into taxable components per rules 1–3. */
function decompose(line: GstLineInput, invoiceMode: InvoiceMode): TaxableComponent[] {
  const total = line.metalValuePaise + line.stoneValuePaise + line.makingPaise;
  if (!line.isPrecious) {
    // Rule 3 — imitation jewellery taxes as a whole item.
    return [
      {
        lineNo: line.lineNo,
        key: { componentType: ComponentType.ITEM, form: MaterialForm.IMITATION, isSetInJewellery: false, invoiceMode },
        valuePaise: total,
      },
    ];
  }
  if (line.isStudded) {
    // Rule 2 — composite studded supply: one component, full value.
    return [
      {
        lineNo: line.lineNo,
        key: { componentType: ComponentType.ITEM, form: MaterialForm.JEWELLERY, isSetInJewellery: true, invoiceMode },
        valuePaise: total,
      },
    ];
  }
  // Rule 1 — itemized: metal, (set) stones, making as separate components.
  const parts: TaxableComponent[] = [];
  if (line.metalValuePaise > 0) {
    parts.push({
      lineNo: line.lineNo,
      key: { componentType: ComponentType.METAL, form: MaterialForm.JEWELLERY, isSetInJewellery: false, invoiceMode },
      valuePaise: line.metalValuePaise,
    });
  }
  if (line.stoneValuePaise > 0) {
    parts.push({
      lineNo: line.lineNo,
      key: { componentType: ComponentType.STONE, form: MaterialForm.LOOSE_POLISHED, isSetInJewellery: true, invoiceMode },
      valuePaise: line.stoneValuePaise,
    });
  }
  if (line.makingPaise > 0) {
    parts.push({
      lineNo: line.lineNo,
      key: { componentType: ComponentType.MAKING, form: MaterialForm.SERVICE, isSetInJewellery: false, invoiceMode },
      valuePaise: line.makingPaise,
    });
  }
  return parts;
}

/** "300 bps" → "3%", "150" → "1.5%", "25" → "0.25%". Display only. */
const bpsToPercentLabel = (bps: number): string => `${trimZeros((bps / 100).toFixed(3))}%`;

/** Half-rate label for CGST/SGST: 300 → "1.5%", 25 → "0.125%". */
const halfPercentLabel = (bps: number): string => `${trimZeros((bps / 200).toFixed(4))}%`;

const trimZeros = (s: string): string => s.replace(/\.?0+$/, '');

/** Run the engine. See module docs for the rules. */
export function computeGst(input: GstEngineInput): GstResult {
  const warnings: string[] = [];
  const intraState = input.sellerStateCode === input.placeOfSupplyStateCode;
  const gstSplit = intraState ? GstSplit.INTRA_STATE : GstSplit.INTER_STATE;

  // ---- 1. line values after their prorated cart discount -----------------
  // The discount reduces components proportionally (metal/stone/making),
  // so the taxable base of each component shrinks fairly.
  let subtotal = 0;
  let discountTotal = 0;
  const componentsPerLine: TaxableComponent[][] = [];
  for (const line of input.lines) {
    const gross = line.metalValuePaise + line.stoneValuePaise + line.makingPaise;
    subtotal += gross;
    discountTotal += line.lineDiscountPaise;
    const comps = decompose(line, input.invoiceMode);
    if (line.lineDiscountPaise > 0 && comps.length > 0) {
      const reductions = allocate(
        line.lineDiscountPaise,
        comps.map((c) => c.valuePaise),
      );
      comps.forEach((c, i) => (c.valuePaise -= reductions[i]!));
    }
    componentsPerLine.push(comps);
  }
  const components = componentsPerLine.flat();

  // ---- 2. old-gold exchange reduces the taxable base (rule 6) ------------
  const valueAfterDiscount = components.reduce((s, c) => s + c.valuePaise, 0);
  const exchangeApplied = Math.min(input.exchangeValuePaise, valueAfterDiscount);
  if (exchangeApplied < input.exchangeValuePaise) {
    warnings.push(
      `exchange credit ₹${(input.exchangeValuePaise / 100).toFixed(2)} exceeds document value — capped; settle the excess as payout`,
    );
  }
  if (exchangeApplied > 0 && components.length > 0) {
    const reductions = allocate(
      exchangeApplied,
      components.map((c) => c.valuePaise),
    );
    components.forEach((c, i) => (c.valuePaise -= reductions[i]!));
  }

  const taxableValue = components.reduce((s, c) => s + c.valuePaise, 0);
  const lineTaxable = new Map<number, Paise>();
  for (const c of components) lineTaxable.set(c.lineNo, (lineTaxable.get(c.lineNo) ?? 0) + c.valuePaise);
  for (const line of input.lines) if (!lineTaxable.has(line.lineNo)) lineTaxable.set(line.lineNo, 0);

  // ---- 3. kaccha documents carry no GST (rule 7) --------------------------
  if (input.invoiceMode !== InvoiceMode.TAX_INVOICE) {
    return {
      gstSplit,
      lineTaxablePaise: lineTaxable,
      taxBuckets: [],
      subtotalPaise: subtotal,
      discountPaise: discountTotal,
      exchangeValuePaise: exchangeApplied,
      taxableValuePaise: taxableValue,
      totalTaxPaise: 0,
      grandTotalPaise: taxableValue,
      warnings,
    };
  }

  // ---- 4. resolve rates; mixed-supply guard per line (rule 5) -------------
  interface RatedComponent extends TaxableComponent {
    rateBps: number;
  }
  const rated: RatedComponent[] = [];
  for (const comps of componentsPerLine) {
    if (comps.length === 0) continue;
    const withRates = comps.map((c) => {
      const rule = resolveTaxRule(input.matrix, c.key, input.at);
      if (!rule) throw new TaxConfigError(c.key);
      return { ...c, rateBps: rule.rateBps };
    });
    const line = input.lines.find((l) => l.lineNo === withRates[0]!.lineNo);
    const distinctRates = new Set(withRates.map((c) => c.rateBps));
    if (line?.bundledSinglePrice && distinctRates.size > 1) {
      // Mixed supply: single price for differently-rated components →
      // whole bundle at the highest rate (CGST Act §8(b)).
      const maxRate = Math.max(...withRates.map((c) => c.rateBps));
      const bundleValue = withRates.reduce((s, c) => s + c.valuePaise, 0);
      warnings.push(`line ${line.lineNo}: mixed supply bundled at a single price — taxed entirely at ${bpsToPercentLabel(maxRate)}`);
      rated.push({ ...withRates[0]!, valuePaise: bundleValue, rateBps: maxRate });
    } else {
      rated.push(...withRates);
    }
  }

  // ---- 5. tax per component, aggregate per rate bucket --------------------
  // Per-component half-up tax, summed into buckets; CGST/SGST split happens
  // at bucket level so the halves always reconcile to the bucket total.
  const byRate = new Map<number, { taxable: Paise; tax: Paise }>();
  for (const c of rated) {
    const bucket = byRate.get(c.rateBps) ?? { taxable: 0, tax: 0 };
    bucket.taxable += c.valuePaise;
    bucket.tax += applyBps(c.valuePaise, c.rateBps);
    byRate.set(c.rateBps, bucket);
  }

  const taxBuckets: TaxBucket[] = [];
  let totalTax = 0;
  for (const [rateBps, { taxable, tax }] of [...byRate.entries()].sort((a, b) => b[0] - a[0])) {
    if (taxable === 0 && tax === 0) continue;
    totalTax += tax;
    if (intraState) {
      const [cgst, sgst] = splitHalves(tax);
      const halfLabel = halfPercentLabel(rateBps);
      // NB: `rateBps` stays the FULL statutory rate (integer); the halving
      // is expressed in the label and the split tax amounts — a 0.25% rate
      // halves to 0.125% which is not representable in integer bps.
      taxBuckets.push({ kind: 'CGST', label: `CGST ${halfLabel}`, rateBps, taxablePaise: taxable, taxPaise: cgst });
      taxBuckets.push({ kind: 'SGST', label: `SGST ${halfLabel}`, rateBps, taxablePaise: taxable, taxPaise: sgst });
    } else {
      taxBuckets.push({ kind: 'IGST', label: `IGST ${bpsToPercentLabel(rateBps)}`, rateBps, taxablePaise: taxable, taxPaise: tax });
    }
  }

  return {
    gstSplit,
    lineTaxablePaise: lineTaxable,
    taxBuckets,
    subtotalPaise: subtotal,
    discountPaise: discountTotal,
    exchangeValuePaise: exchangeApplied,
    taxableValuePaise: taxableValue,
    totalTaxPaise: totalTax,
    grandTotalPaise: taxableValue + totalTax,
    warnings,
  };
}
