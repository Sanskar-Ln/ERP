/**
 * Tax-rule resolution — PURE domain logic (no NestJS, no Prisma).
 *
 * BUSINESS CONTEXT (India GST, encoded as tenant-configurable DATA):
 * the GST rate applicable to a jewellery sale component depends on WHAT it
 * is (metal / stone / making / whole item), its FORM (finished jewellery,
 * bullion, loose rough vs polished stone, imitation, service), whether a
 * stone is SET in jewellery (a set diamond rides the 3% jewellery composite
 * rate; a loose polished diamond is 1.5%), and the DOCUMENT MODE (a kaccha
 * Estimate carries no GST at all).
 *
 * The tenant's TaxRule rows form a matrix keyed by exactly those four
 * dimensions, with effective dating so rate changes (e.g. a Budget
 * amendment) are new rows, never edits — history stays reproducible.
 */
import type { ComponentType, InvoiceMode, MaterialForm } from '@erp/shared';

/** One row of the tenant's tax matrix (mirrors the TaxRule table). */
export interface TaxRuleRow {
  id: string;
  componentType: ComponentType;
  form: MaterialForm;
  isSetInJewellery: boolean;
  invoiceMode: InvoiceMode;
  /** GST rate in basis points (300 = 3%, 25 = 0.25%) */
  rateBps: number;
  /** HSN/SAC code to print for this component (resolved id or code) */
  hsnCodeId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/** The lookup key — the four dimensions that determine a GST rate. */
export interface TaxKey {
  componentType: ComponentType;
  form: MaterialForm;
  isSetInJewellery: boolean;
  invoiceMode: InvoiceMode;
}

/**
 * Resolve the applicable tax rule for `key` at time `at`.
 *
 * Selection: exact match on all four key dimensions, effective window
 * containing `at` (from ≤ at < to; open-ended when `effectiveTo` is null).
 * If several match (overlapping windows), the one with the LATEST
 * `effectiveFrom` wins — "most recently effective rule prevails", which
 * lets a tenant post a correcting row without deleting history.
 *
 * @returns the winning rule, or null when the matrix has no answer —
 *          callers must treat null as a configuration error, NOT as 0%.
 */
export function resolveTaxRule(matrix: readonly TaxRuleRow[], key: TaxKey, at: Date): TaxRuleRow | null {
  let winner: TaxRuleRow | null = null;
  for (const rule of matrix) {
    if (
      rule.componentType !== key.componentType ||
      rule.form !== key.form ||
      rule.isSetInJewellery !== key.isSetInJewellery ||
      rule.invoiceMode !== key.invoiceMode
    ) {
      continue;
    }
    if (rule.effectiveFrom.getTime() > at.getTime()) continue;
    if (rule.effectiveTo && rule.effectiveTo.getTime() <= at.getTime()) continue;
    if (!winner || rule.effectiveFrom.getTime() > winner.effectiveFrom.getTime()) winner = rule;
  }
  return winner;
}
