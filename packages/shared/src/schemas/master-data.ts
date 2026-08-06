/**
 * Master-data DTO schemas: metals & purities, stone types, HSN codes,
 * the configurable tax-rule matrix, customers (KYC), suppliers, karigars,
 * and the metal-rate feed / manual rate fix.
 */
import { z } from 'zod';
import {
  CertificateLab,
  ComponentType,
  InvoiceMode,
  KycDocType,
  MaterialForm,
  MetalCode,
  RateSource,
} from '../enums';
import { zBps, zDateTime, zFineness, zGstStateCode, zGstin, zId, zPaise, zPan } from './common';

// ---------------------------------------------------------------- metals

export const zCreateMetal = z.object({
  code: z.nativeEnum(MetalCode),
  name: z.string().min(1).max(60),
});
export type CreateMetal = z.infer<typeof zCreateMetal>;

/**
 * A purity of a metal (22K/916, 18K/750, silver 925 …).
 * `karat` is optional display info; `finenessPpt` is what pricing math uses.
 */
export const zCreatePurity = z.object({
  metalId: zId,
  label: z.string().min(1).max(30), // e.g. "22K", "916 HM", "Sterling 925"
  karat: z.number().int().min(1).max(24).nullable().optional(),
  finenessPpt: zFineness,
});
export type CreatePurity = z.infer<typeof zCreatePurity>;

// ---------------------------------------------------------------- stones

/**
 * Stone type master (DIAMOND, RUBY, EMERALD …) with which attribute set it
 * uses: diamonds carry 4Cs; coloured stones carry carat/ratti weight.
 */
export const zCreateStoneType = z.object({
  code: z.string().min(1).max(30).regex(/^[A-Z0-9_]+$/),
  name: z.string().min(1).max(60),
  isDiamond: z.boolean(),
});
export type CreateStoneType = z.infer<typeof zCreateStoneType>;

/** Diamond 4C attribute block (only on diamond components). */
export const zDiamond4C = z.object({
  cut: z.enum(['IDEAL', 'EXCELLENT', 'VERY_GOOD', 'GOOD', 'FAIR', 'POOR']),
  color: z.string().regex(/^[D-Z]$/, 'colour grade D–Z'),
  clarity: z.enum(['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3']),
  // carat weight lives on the component itself
});
export type Diamond4C = z.infer<typeof zDiamond4C>;

/** Stone certificate reference (IGI/GIA/SGL + certificate number). */
export const zCertificateRef = z.object({
  lab: z.nativeEnum(CertificateLab),
  certificateNo: z.string().min(1).max(60),
});
export type CertificateRef = z.infer<typeof zCertificateRef>;

// ---------------------------------------------------------------- HSN & tax matrix

export const zCreateHsnCode = z.object({
  code: z.string().regex(/^\d{4,8}$/, 'HSN is 4–8 digits'),
  description: z.string().min(1).max(200),
});
export type CreateHsnCode = z.infer<typeof zCreateHsnCode>;

/**
 * One row of the configurable tax-rule matrix.
 * Resolution key: (componentType, form, isSetInJewellery, invoiceMode).
 * BUSINESS RULE: rates are DATA, not code — the 2026 India defaults
 * (3% jewellery, 5% making, 0.25%/1.5% loose diamonds, 18% imitation)
 * are seeded rows a tenant can override, with effective dating.
 */
export const zCreateTaxRule = z.object({
  componentType: z.nativeEnum(ComponentType),
  form: z.nativeEnum(MaterialForm),
  isSetInJewellery: z.boolean(),
  invoiceMode: z.nativeEnum(InvoiceMode),
  hsnCodeId: zId.nullable().optional(),
  rateBps: zBps,
  effectiveFrom: zDateTime,
  effectiveTo: zDateTime.nullable().optional(),
  note: z.string().max(300).optional(),
});
export type CreateTaxRule = z.infer<typeof zCreateTaxRule>;

// ---------------------------------------------------------------- parties

export const zKycDoc = z.object({
  docType: z.nativeEnum(KycDocType),
  docNumber: z.string().min(4).max(40),
});
export type KycDoc = z.infer<typeof zKycDoc>;

export const zCreateCustomer = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().regex(/^\+?\d{10,13}$/),
  email: z.string().email().optional(),
  addressLine: z.string().max(300).optional(),
  city: z.string().max(80).optional(),
  stateCode: zGstStateCode,
  pincode: z.string().regex(/^\d{6}$/).optional(),
  gstin: zGstin.optional(),
  pan: zPan.optional(),
  kycDocs: z.array(zKycDoc).default([]),
});
export type CreateCustomer = z.infer<typeof zCreateCustomer>;

/**
 * Customer-specific rate adjustment on the board metal rate, in SIGNED
 * basis points: −100 = 1% below board (a loyal-customer concession),
 * +50 = 0.5% premium. Applied server-side at pricing time; the effective
 * rate is snapshotted on the document line. ADMIN-only to change.
 */
export const zUpdateCustomerRate = z.object({
  rateAdjustBps: z.number().int().min(-2_000).max(2_000),
});
export type UpdateCustomerRate = z.infer<typeof zUpdateCustomerRate>;

export const zCreateSupplier = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().regex(/^\+?\d{10,13}$/).optional(),
  gstin: zGstin.optional(),
  stateCode: zGstStateCode,
  addressLine: z.string().max(300).optional(),
});
export type CreateSupplier = z.infer<typeof zCreateSupplier>;

/** Karigar = artisan/goldsmith to whom metal is issued for making. */
export const zCreateKarigar = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().regex(/^\+?\d{10,13}$/).optional(),
  specialty: z.string().max(120).optional(),
});
export type CreateKarigar = z.infer<typeof zCreateKarigar>;

// ---------------------------------------------------------------- metal rates

/**
 * A metal-rate row: either an external FEED tick or a MANUAL_FIX — the
 * jeweller's own board rate that overrides the feed for billing.
 * Rates are quoted in paise per 10 g at a specific purity (Indian bourse
 * convention).
 */
export const zCreateMetalRate = z.object({
  metalId: zId,
  purityId: zId,
  ratePaisePer10g: zPaise,
  source: z.nativeEnum(RateSource),
  effectiveAt: zDateTime,
  note: z.string().max(200).optional(),
});
export type CreateMetalRate = z.infer<typeof zCreateMetalRate>;
