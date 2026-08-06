/**
 * Purchase-order (procurement) and customer-order (pipeline) DTO schemas.
 *
 * Purchase flow: Supplier → PO (DRAFT→ORDERED) → receive with weight
 * verification → Lot + inventory intake → RECEIVED, with supplier payments
 * tracked against the PO.
 *
 * Customer orders: DRAFT→CONFIRMED→PROCESSING→READY→DELIVERED→COMPLETED
 * (CANCELLED from any pre-DELIVERED state). Orders are workflow objects —
 * the money lives on Documents; `documentId` links the billing.
 */
import { z } from 'zod';
import { OrderStatus, PaymentMode, PurchaseOrderStatus } from '../enums';
import { zDateTime, zGrams, zId, zPaise } from './common';

// ---------------------------------------------------------------- purchases

export const zPurchaseOrderLine = z.object({
  description: z.string().min(1).max(200),
  category: z.string().max(60).optional(),
  pieces: z.number().int().min(1).default(1),
  /** expected metal weight, grams (verified at receipt) */
  expectedWeightG: zGrams.optional(),
  purityId: zId.optional(),
  ratePaisePer10g: zPaise.optional(),
  /** agreed line value, paise */
  valuePaise: zPaise,
});
export type PurchaseOrderLineInput = z.infer<typeof zPurchaseOrderLine>;

export const zCreatePurchaseOrder = z.object({
  supplierId: zId,
  branchId: zId,
  expectedAt: zDateTime.optional(),
  note: z.string().max(500).optional(),
  lines: z.array(zPurchaseOrderLine).min(1),
});
export type CreatePurchaseOrder = z.infer<typeof zCreatePurchaseOrder>;

/** Goods receipt: verify weights per line; a Lot is created for intake. */
export const zReceivePurchaseOrder = z.object({
  lotNo: z.string().min(1).max(40).optional(),
  note: z.string().max(300).optional(),
  lines: z
    .array(z.object({ lineNo: z.number().int().min(1), receivedWeightG: zGrams }))
    .default([]),
});
export type ReceivePurchaseOrder = z.infer<typeof zReceivePurchaseOrder>;

/** Money paid to the supplier against a PO (append-only). */
export const zSupplierPayment = z.object({
  mode: z.nativeEnum(PaymentMode),
  amountPaise: zPaise.refine((v) => v > 0, 'amount must be positive'),
  reference: z.string().max(120).optional(),
  note: z.string().max(300).optional(),
  paidAt: zDateTime.optional(),
});
export type SupplierPaymentInput = z.infer<typeof zSupplierPayment>;

export const zPurchaseOrderStatus = z.nativeEnum(PurchaseOrderStatus);

// ---------------------------------------------------------------- orders

export const zOrderLine = z.object({
  /** stock item to sell (reserved on CONFIRMED) — or omit for made-to-order */
  itemId: zId.optional(),
  /** description for made-to-order lines (required when no itemId) */
  description: z.string().max(200).optional(),
  pieces: z.number().int().min(1).default(1),
  expectedWeightG: zGrams.optional(),
});
export type OrderLineInput = z.infer<typeof zOrderLine>;

export const zCreateOrder = z.object({
  customerId: zId,
  branchId: zId,
  note: z.string().max(500).optional(),
  lines: z.array(zOrderLine).min(1),
});
export type CreateOrder = z.infer<typeof zCreateOrder>;

/** Advance an order along the pipeline (transition validated server-side). */
export const zAdvanceOrder = z.object({
  to: z.nativeEnum(OrderStatus),
  /** required to reach DELIVERED unless already linked */
  documentId: zId.optional(),
  reason: z.string().max(300).optional(),
});
export type AdvanceOrder = z.infer<typeof zAdvanceOrder>;

export const zOrderStatusEnum = z.nativeEnum(OrderStatus);
