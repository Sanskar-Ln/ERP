/**
 * Inventory DTO schemas: composite items (metal + stone + making),
 * dual-unit tracking (pieces AND weights), lots, append-only stock
 * movements, inter-branch transfers.
 */
import { z } from 'zod';
import { ItemStatus, MakingChargeType, MovementType, TransferStatus } from '../enums';
import { zBps, zCarats, zGrams, zGramsSigned, zId, zPaise, zRatti } from './common';
import { zCertificateRef, zDiamond4C } from './master-data';

/** Metal component of a composite item. Weights as gram strings (3 dp). */
export const zItemMetalComponent = z.object({
  metalId: zId,
  purityId: zId,
  grossWeightG: zGrams,
  netWeightG: zGrams,
  /** wastage allowance billed on top of net weight, in basis points (800 = 8%) */
  wastageBps: zBps.default(0),
});
export type ItemMetalComponentInput = z.infer<typeof zItemMetalComponent>;

/**
 * Stone component. Diamonds carry 4Cs; coloured stones may carry ratti.
 * `ratePaisePerCarat` × carat weight prices the stone when sold loose or
 * itemized; studded pricing may instead use a flat `valuePaise`.
 */
export const zItemStoneComponent = z.object({
  stoneTypeId: zId,
  pieces: z.number().int().min(1),
  weightCt: zCarats,
  weightRatti: zRatti.optional(),
  fourC: zDiamond4C.optional(),
  certificate: zCertificateRef.optional(),
  ratePaisePerCarat: zPaise.optional(),
  valuePaise: zPaise,
});
export type ItemStoneComponentInput = z.infer<typeof zItemStoneComponent>;

/** Making-charge rule attached to an item. */
export const zMakingCharge = z.object({
  type: z.nativeEnum(MakingChargeType),
  /** FLAT: paise/piece; PER_GRAM: paise/gram; PERCENT_OF_METAL: basis points */
  value: z.number().int().safe().nonnegative(),
});
export type MakingChargeInput = z.infer<typeof zMakingCharge>;

/**
 * Create a composite inventory item.
 * Dual-unit rule: an item always tracks BOTH piece count and weights —
 * jewellery stock control reconciles pieces for counting and grams for value.
 */
export const zCreateItem = z.object({
  /** stable human/scanner-facing code; the barcode encodes THIS, never price */
  itemCode: z.string().min(3).max(40).regex(/^[A-Z0-9-]+$/),
  name: z.string().min(1).max(160),
  description: z.string().max(500).optional(),
  /** product classification, e.g. "Ring" / "Chain" (free text, filterable) */
  category: z.string().max(60).optional(),
  subCategory: z.string().max(60).optional(),
  branchId: zId,
  lotId: zId.nullable().optional(),
  hsnCodeId: zId,
  pieces: z.number().int().min(1).default(1),
  metalComponents: z.array(zItemMetalComponent).min(0),
  stoneComponents: z.array(zItemStoneComponent).min(0),
  makingCharge: zMakingCharge,
  /** flat hallmarking charge for the piece, paise (rides the making/service GST path) */
  hallmarkChargePaise: zPaise.default(0),
  /** flat packing charge, paise */
  packingChargePaise: zPaise.default(0),
  /** any other flat charge, paise */
  otherChargePaise: zPaise.default(0),
  /** BIS hallmark unique id (HUID) / certificate number, if hallmarked */
  hallmarkNo: z.string().max(60).optional(),
  hallmarkAgency: z.string().max(120).optional(),
  /** true → studded jewellery → composite 3% GST on whole item value */
  isStudded: z.boolean().default(false),
  /** false → imitation jewellery path (18%, HSN 7117) */
  isPrecious: z.boolean().default(true),
});
export type CreateItem = z.infer<typeof zCreateItem>;

export const zItemStatus = z.nativeEnum(ItemStatus);

/** Lot = a purchase/manufacture batch items belong to (costing & recall). */
export const zCreateLot = z.object({
  lotNo: z.string().min(1).max(40),
  supplierId: zId.nullable().optional(),
  karigarId: zId.nullable().optional(),
  receivedAt: z.string().datetime({ offset: true }),
  note: z.string().max(300).optional(),
});
export type CreateLot = z.infer<typeof zCreateLot>;

/**
 * Append-only stock movement. IMMUTABILITY RULE: movements are never
 * edited or deleted; corrections post a REVERSAL movement referencing
 * the original via `reversesId`.
 */
export const zCreateStockMovement = z.object({
  itemId: zId,
  movementType: z.nativeEnum(MovementType),
  branchId: zId,
  pieces: z.number().int(),
  grossWeightG: zGramsSigned, // ADJUSTMENT may subtract weight
  refDocumentId: zId.nullable().optional(),
  reversesId: zId.nullable().optional(),
  note: z.string().max(300).optional(),
});
export type CreateStockMovement = z.infer<typeof zCreateStockMovement>;

/** Inter-branch transfer: TRANSFER_OUT at source, TRANSFER_IN on receipt. */
export const zCreateBranchTransfer = z.object({
  fromBranchId: zId,
  toBranchId: zId,
  itemIds: z.array(zId).min(1),
  note: z.string().max(300).optional(),
});
export type CreateBranchTransfer = z.infer<typeof zCreateBranchTransfer>;

export const zTransferStatus = z.nativeEnum(TransferStatus);
