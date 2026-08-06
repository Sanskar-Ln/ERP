/**
 * Tagging, label-design and printer DTO schemas.
 *
 * BUSINESS RULE: the barcode encodes ONLY the stable `itemCode` — never the
 * price, weight or rate. Prices are resolved live from the item + today's
 * metal rate at scan time, so repricing (daily rate changes) NEVER requires
 * reprinting tags.
 *
 * Label templates are DEVICE-INDEPENDENT: they describe shape, millimetre
 * geometry and field placement. Which printer language renders them (ZPL /
 * TSPL / HTML) is decided at print time from the printer profile, so a
 * template outlives any particular piece of hardware.
 */
import { z } from 'zod';
import {
  BarcodeSymbology,
  LabelField,
  LabelRegion,
  PrinterConnection,
  PrinterLanguage,
  TagShape,
} from '../enums';
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

/** One placed field on the label. */
export const zLabelFieldSpec = z.object({
  field: z.nativeEnum(LabelField),
  region: z.nativeEnum(LabelRegion).default(LabelRegion.MAIN),
  /** point size for text; ignored for BARCODE */
  fontPt: z.number().min(3).max(24).default(6),
});
export type LabelFieldSpec = z.infer<typeof zLabelFieldSpec>;

/**
 * Label template: a named physical layout.
 *
 * RECTANGLE uses `widthMm` × `heightMm`. DUMBBELL additionally splits the
 * width into `leftFlagMm` + `neckMm` + `rightFlagMm`, which must sum to
 * `widthMm` — the neck is the unprintable strip that wraps the jewellery.
 */
export const zCreateLabelTemplate = z
  .object({
    name: z.string().min(1).max(60),
    shape: z.nativeEnum(TagShape).default(TagShape.RECTANGLE),
    widthMm: z.number().min(10).max(200),
    heightMm: z.number().min(5).max(100),
    leftFlagMm: z.number().min(5).max(100).optional(),
    neckMm: z.number().min(3).max(60).optional(),
    rightFlagMm: z.number().min(5).max(100).optional(),
    symbology: zSymbology.default(BarcodeSymbology.CODE128),
    fields: z.array(zLabelFieldSpec).min(1),
    isDefault: z.boolean().default(false),
  })
  .superRefine((t, ctx) => {
    if (t.shape !== TagShape.DUMBBELL) return;
    if (t.leftFlagMm == null || t.neckMm == null || t.rightFlagMm == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'dumbbell templates need leftFlagMm, neckMm and rightFlagMm' });
      return;
    }
    const sum = t.leftFlagMm + t.neckMm + t.rightFlagMm;
    // tolerate float dust from the UI, but the flags must really span the tag
    if (Math.abs(sum - t.widthMm) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `left + neck + right (${sum}mm) must equal widthMm (${t.widthMm}mm)`,
      });
    }
  });
export type CreateLabelTemplate = z.infer<typeof zCreateLabelTemplate>;

/** Batch label generation: render labels for many tags in one go. */
export const zCreateLabelBatch = z.object({
  templateId: zId,
  tagIds: z.array(zId).min(1).max(1000),
});
export type CreateLabelBatch = z.infer<typeof zCreateLabelBatch>;

/**
 * A printer profile. `language: AUTO` means the hardware has not been
 * identified yet — `POST /printers/:id/identify` probes it and resolves the
 * language, so the shop can register a printer before knowing its brand.
 */
export const zCreatePrinter = z
  .object({
    name: z.string().min(1).max(60),
    connection: z.nativeEnum(PrinterConnection).default(PrinterConnection.BROWSER),
    language: z.nativeEnum(PrinterLanguage).default(PrinterLanguage.AUTO),
    /** IP/hostname — required for NETWORK */
    host: z.string().max(120).optional(),
    port: z.number().int().min(1).max(65535).default(9100),
    /** printhead resolution; drives the mm → dots conversion */
    dpi: z.union([z.literal(203), z.literal(300), z.literal(600)]).default(203),
    isDefault: z.boolean().default(false),
  })
  .superRefine((p, ctx) => {
    if (p.connection === PrinterConnection.NETWORK && !p.host) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'network printers need a host' });
    }
  });
export type CreatePrinter = z.infer<typeof zCreatePrinter>;

export const zPrinterLanguage = z.nativeEnum(PrinterLanguage);
export const zTagShape = z.nativeEnum(TagShape);
