/**
 * Building-block zod schemas reused across all API DTOs.
 * These encode the wire representation rules:
 * - money travels as integer paise (JSON number, safe-integer checked)
 * - weights travel as fixed-precision decimal STRINGS (grams 3 dp, carats 3 dp)
 * - all ids are UUIDs
 */
import { z } from 'zod';

/** UUID id — application-generated v4 (accepts any RFC-4122 UUID on the wire). */
export const zId = z.string().uuid();

/** Integer paise amount ≥ 0. */
export const zPaise = z.number().int().safe().nonnegative();

/** Integer paise amount, may be negative (adjustments, reversals). */
export const zPaiseSigned = z.number().int().safe();

/** Basis points 0..100000 (0%..1000%) — GST rates, wastage, margins. */
export const zBps = z.number().int().min(0).max(100_000);

/** Gram weight string, up to 3 decimals: "12", "12.3", "12.345". */
export const zGrams = z.string().regex(/^\d+(\.\d{1,3})?$/, 'expected grams with up to 3 decimals');

/** Carat weight string, up to 3 decimals. */
export const zCarats = z.string().regex(/^\d+(\.\d{1,3})?$/, 'expected carats with up to 3 decimals');

/** Ratti weight string, up to 2 decimals. */
export const zRatti = z.string().regex(/^\d+(\.\d{1,2})?$/, 'expected ratti with up to 2 decimals');

/** Fineness in parts-per-thousand (916 = 22K). */
export const zFineness = z.number().int().min(1).max(1000);

/** Indian GST state code: 2 digits, "01".."38" + "97" (as used in GSTIN prefixes). */
export const zGstStateCode = z.string().regex(/^\d{2}$/, 'expected 2-digit GST state code');

/** GSTIN format: 2-digit state + 10-char PAN + entity + Z + checksum. */
export const zGstin = z
  .string()
  .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/, 'invalid GSTIN');

/** PAN format. */
export const zPan = z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'invalid PAN');

/** ISO-8601 datetime string. */
export const zDateTime = z.string().datetime({ offset: true });

/** Standard cursor pagination query. */
export const zPageQuery = z.object({
  cursor: zId.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type PageQuery = z.infer<typeof zPageQuery>;
