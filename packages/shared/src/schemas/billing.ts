/**
 * Billing & document DTO schemas.
 *
 * One cart shape (`zCart`) feeds the document engine, which can produce a
 * Tax Invoice (full GST), an Estimate/Cash Memo (kaccha — no GST), or a
 * Delivery Challan. Estimates convert to Tax Invoices with linkage.
 *
 * IMMUTABILITY RULE: documents are append-only. There is no "update
 * document" DTO on purpose — corrections supersede or cancel via new
 * documents.
 */
import { z } from 'zod';
import { DocStatus, DocType } from '../enums';
import { zDateTime, zGrams, zGstStateCode, zId, zPaise } from './common';

/**
 * A cart line referencing a tagged inventory item. Pricing inputs that vary
 * per sale (negotiated making discount, manual metal-rate override) ride on
 * the line; everything else comes from the item + rate masters server-side.
 */
export const zCartLine = z.object({
  itemId: zId,
  pieces: z.number().int().min(1).default(1),
  /** optional negotiated discount on making charges, paise */
  makingDiscountPaise: zPaise.default(0),
  /** optional per-line metal rate override (paise per 10g) — else board rate */
  metalRatePaisePer10gOverride: zPaise.optional(),
});
export type CartLine = z.infer<typeof zCartLine>;

/**
 * Old-gold exchange tendered against the purchase.
 * BUSINESS RULE: when a customer trades in old jewellery, GST applies only to
 * the VALUE ADDITION (new item value − exchange value), not the full new
 * item price. Purity/weight assessed at the counter fixes the exchange value.
 */
export const zOldGoldExchange = z.object({
  metalId: zId,
  purityId: zId,
  grossWeightG: zGrams,
  netWeightG: zGrams,
  /** assessed rate for old metal, paise per 10 g (usually board rate minus melt margin) */
  ratePaisePer10g: zPaise,
  note: z.string().max(300).optional(),
});
export type OldGoldExchangeInput = z.infer<typeof zOldGoldExchange>;

/** The single cart shape all three document types are produced from. */
export const zCart = z.object({
  customerId: zId,
  branchId: zId,
  lines: z.array(zCartLine).min(1),
  oldGoldExchanges: z.array(zOldGoldExchange).default([]),
  /** overall discount applied before tax, prorated across lines, paise */
  cartDiscountPaise: zPaise.default(0),
  /** place-of-supply state code; defaults to customer's state server-side */
  placeOfSupplyStateCode: zGstStateCode.optional(),
  note: z.string().max(500).optional(),
});
export type Cart = z.infer<typeof zCart>;

export const zCreateDocument = z.object({
  docType: z.nativeEnum(DocType),
  cart: zCart,
});
export type CreateDocument = z.infer<typeof zCreateDocument>;

/** Convert an issued Estimate into a Tax Invoice (linkage kept both ways). */
export const zConvertEstimate = z.object({
  estimateId: zId,
});
export type ConvertEstimate = z.infer<typeof zConvertEstimate>;

/** Cancel (reverse) an issued document — creates reversal, never deletes. */
export const zCancelDocument = z.object({
  documentId: zId,
  reason: z.string().min(3).max(300),
});
export type CancelDocument = z.infer<typeof zCancelDocument>;

export const zDocStatus = z.nativeEnum(DocStatus);

/** Tax line as returned on a document (one row per rate bucket per kind). */
export const zTaxLineOut = z.object({
  label: z.string(), // e.g. "CGST 1.5%", "IGST 3%"
  rateBps: z.number().int(),
  taxablePaise: zPaise,
  taxPaise: zPaise,
});
export type TaxLineOut = z.infer<typeof zTaxLineOut>;

/** Document summary returned by the API after issue. */
export const zDocumentOut = z.object({
  id: zId,
  docType: z.nativeEnum(DocType),
  docNumber: z.string(),
  status: zDocStatus,
  issuedAt: zDateTime,
  customerId: zId,
  subtotalPaise: zPaise,
  discountPaise: zPaise,
  exchangeValuePaise: zPaise,
  taxableValuePaise: zPaise,
  taxLines: z.array(zTaxLineOut),
  totalTaxPaise: zPaise,
  grandTotalPaise: zPaise,
  convertedFromId: zId.nullable(),
  supersedesId: zId.nullable(),
});
export type DocumentOut = z.infer<typeof zDocumentOut>;
