/**
 * Tagging & barcode DTO schemas.
 *
 * BUSINESS RULE: the barcode encodes ONLY the stable `itemCode` — never the
 * price, weight or rate. Prices are resolved live from the item + today's
 * metal rate at scan time, so repricing (daily rate changes) NEVER requires
 * reprinting tags.
 */
import { z } from 'zod';
import { BarcodeSymbology } from '../enums';
import { zId } from './common';

export const zSymbology = z.nativeEnum(BarcodeSymbology);

/** Create one tag per physical piece of an item. */
export const zCreateTags = z.object({
  itemId: zId,
  /** number of physical pieces to tag (≤ item's piece count) */
  count: z.number().int().min(1).max(500).default(1),
  symbology: zSymbology.default(BarcodeSymbology.CODE128),
});
export type CreateTags = z.infer<typeof zCreateTags>;

/**
 * Label template: a named layout for the physical label. `widthMm`/`heightMm`
 * size the sticker; `fields` picks which item attributes print as text next
 * to the barcode (price is allowed as TEXT since text reprints are optional —
 * the barcode itself stays price-free).
 */
export const zCreateLabelTemplate = z.object({
  name: z.string().min(1).max(60),
  widthMm: z.number().int().min(10).max(200),
  heightMm: z.number().int().min(6).max(100),
  symbology: zSymbology.default(BarcodeSymbology.CODE128),
  fields: z
    .array(z.enum(['ITEM_CODE', 'NAME', 'GROSS_WEIGHT', 'NET_WEIGHT', 'PURITY', 'PIECES', 'PRICE_TEXT']))
    .min(1),
  isDefault: z.boolean().default(false),
});
export type CreateLabelTemplate = z.infer<typeof zCreateLabelTemplate>;

/** Batch label generation: render labels for many tags in one PDF/PNG set. */
export const zCreateLabelBatch = z.object({
  templateId: zId,
  tagIds: z.array(zId).min(1).max(1000),
});
export type CreateLabelBatch = z.infer<typeof zCreateLabelBatch>;
