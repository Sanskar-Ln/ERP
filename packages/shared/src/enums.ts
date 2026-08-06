/**
 * Domain enums shared by API, web and mobile.
 *
 * These are plain string-literal unions + frozen objects (not TS `enum`)
 * so they serialize cleanly over JSON, work in zod `z.nativeEnum`, and
 * stay tree-shakeable in the web/mobile bundles.
 */

/**
 * RBAC roles — deliberately just two:
 * - ADMIN: full access; bypasses every @Roles check in the API.
 * - OPS:   day-to-day operations (billing, stock adjustments, customers,
 *          board-rate fixing) — no masters, staff, tagging, reports,
 *          transfers or corrections (cancel/reverse).
 */
export const Role = {
  ADMIN: 'ADMIN',
  OPS: 'OPS',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

/**
 * What a taxable component physically is. Drives the tax-rule matrix key.
 * - METAL: gold/silver/platinum value portion of an item
 * - STONE: diamond or coloured stone portion
 * - MAKING: labour / making charges
 * - ITEM: a whole finished article taxed as one (e.g. imitation jewellery)
 */
export const ComponentType = {
  METAL: 'METAL',
  STONE: 'STONE',
  MAKING: 'MAKING',
  ITEM: 'ITEM',
} as const;
export type ComponentType = (typeof ComponentType)[keyof typeof ComponentType];

/**
 * Physical/commercial form of the component — second axis of the tax matrix.
 * GST rates differ by form: e.g. loose rough diamonds 0.25%, loose cut &
 * polished 1.5%, but a diamond SET in jewellery rides the 3% composite rate.
 */
export const MaterialForm = {
  /** finished jewellery article (HSN 7113) */
  JEWELLERY: 'JEWELLERY',
  /** bullion / raw metal (bars, coins; HSN 7106/7108) */
  BULLION: 'BULLION',
  /** loose stone, rough/uncut (HSN 7102) */
  LOOSE_ROUGH: 'LOOSE_ROUGH',
  /** loose stone, cut & polished (HSN 7102) */
  LOOSE_POLISHED: 'LOOSE_POLISHED',
  /** imitation jewellery (HSN 7117) */
  IMITATION: 'IMITATION',
  /** labour service (making charges; SAC 9988) */
  SERVICE: 'SERVICE',
} as const;
export type MaterialForm = (typeof MaterialForm)[keyof typeof MaterialForm];

/**
 * Document mode used to key tax resolution:
 * a kaccha Estimate/Cash-Memo carries no GST at all, so the matrix can
 * resolve to rate 0 for ESTIMATE mode while TAX_INVOICE resolves real rates.
 */
export const InvoiceMode = {
  TAX_INVOICE: 'TAX_INVOICE',
  ESTIMATE: 'ESTIMATE',
  DELIVERY_CHALLAN: 'DELIVERY_CHALLAN',
} as const;
export type InvoiceMode = (typeof InvoiceMode)[keyof typeof InvoiceMode];

/** Document types produced by the document engine (one cart → any of these). */
export const DocType = InvoiceMode;
export type DocType = InvoiceMode;

/**
 * Lifecycle of an immutable financial document.
 * Documents are never edited: they are ISSUED, then possibly SUPERSEDED by a
 * corrected version, CANCELLED by a reversal, or CONVERTED (estimate → tax
 * invoice, keeping linkage).
 */
export const DocStatus = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  SUPERSEDED: 'SUPERSEDED',
  CANCELLED: 'CANCELLED',
  CONVERTED: 'CONVERTED',
} as const;
export type DocStatus = (typeof DocStatus)[keyof typeof DocStatus];

/** GST split flavour: intra-state = CGST+SGST halves, inter-state = single IGST. */
export const GstSplit = {
  INTRA_STATE: 'INTRA_STATE',
  INTER_STATE: 'INTER_STATE',
} as const;
export type GstSplit = (typeof GstSplit)[keyof typeof GstSplit];

/** Append-only stock movement kinds. Reversals are new rows, never edits. */
export const MovementType = {
  PURCHASE_IN: 'PURCHASE_IN',
  SALE_OUT: 'SALE_OUT',
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN',
  ADJUSTMENT: 'ADJUSTMENT',
  EXCHANGE_IN: 'EXCHANGE_IN',
  KARIGAR_ISSUE: 'KARIGAR_ISSUE',
  KARIGAR_RECEIPT: 'KARIGAR_RECEIPT',
  /** zero-quantity annotation: item held for a customer/order (status flip) */
  RESERVE: 'RESERVE',
  /** zero-quantity annotation: reservation released back to open stock */
  UNRESERVE: 'UNRESERVE',
  REVERSAL: 'REVERSAL',
} as const;
export type MovementType = (typeof MovementType)[keyof typeof MovementType];

/** Certifying laboratories accepted for stone certificates. */
export const CertificateLab = {
  IGI: 'IGI',
  GIA: 'GIA',
  SGL: 'SGL',
  OTHER: 'OTHER',
} as const;
export type CertificateLab = (typeof CertificateLab)[keyof typeof CertificateLab];

/** Barcode symbologies supported by the tagging module (bwip-js). */
export const BarcodeSymbology = {
  CODE128: 'CODE128',
  DATAMATRIX: 'DATAMATRIX',
} as const;
export type BarcodeSymbology = (typeof BarcodeSymbology)[keyof typeof BarcodeSymbology];

/**
 * Physical shape of a label.
 * - RECTANGLE: a plain sticker.
 * - DUMBBELL: the jewellery "butterfly" tag — two printable flags joined by
 *   a narrow neck that wraps around a ring shank or chain. Both flags print.
 */
export const TagShape = {
  RECTANGLE: 'RECTANGLE',
  DUMBBELL: 'DUMBBELL',
} as const;
export type TagShape = (typeof TagShape)[keyof typeof TagShape];

/** Where a field sits on the label. LEFT/RIGHT are the dumbbell flags. */
export const LabelRegion = {
  MAIN: 'MAIN',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
} as const;
export type LabelRegion = (typeof LabelRegion)[keyof typeof LabelRegion];

/** Printable fields. PRICE_TEXT is a static marker — never a number. */
export const LabelField = {
  BARCODE: 'BARCODE',
  ITEM_CODE: 'ITEM_CODE',
  NAME: 'NAME',
  CATEGORY: 'CATEGORY',
  GROSS_WEIGHT: 'GROSS_WEIGHT',
  NET_WEIGHT: 'NET_WEIGHT',
  PURITY: 'PURITY',
  PIECES: 'PIECES',
  HALLMARK: 'HALLMARK',
  PRICE_TEXT: 'PRICE_TEXT',
} as const;
export type LabelField = (typeof LabelField)[keyof typeof LabelField];

/**
 * Printer command language. AUTO means "ask the hardware" — identification
 * probes the device and resolves this to a concrete language.
 */
export const PrinterLanguage = {
  ZPL: 'ZPL',
  TSPL: 'TSPL',
  HTML: 'HTML',
  AUTO: 'AUTO',
} as const;
export type PrinterLanguage = (typeof PrinterLanguage)[keyof typeof PrinterLanguage];

/**
 * How a print job reaches the printer.
 * - BROWSER:  render HTML, the shop PC's own driver prints it (zero setup)
 * - DOWNLOAD: hand back the raw command file to send to the printer
 * - NETWORK:  push raw commands to host:port (usually 9100) — LAN only
 */
export const PrinterConnection = {
  BROWSER: 'BROWSER',
  DOWNLOAD: 'DOWNLOAD',
  NETWORK: 'NETWORK',
} as const;
export type PrinterConnection = (typeof PrinterConnection)[keyof typeof PrinterConnection];

/** How making charges are quoted on an item. */
export const MakingChargeType = {
  /** flat paise per piece */
  FLAT: 'FLAT',
  /** paise per gram of net weight */
  PER_GRAM: 'PER_GRAM',
  /** percentage (basis points) of metal value */
  PERCENT_OF_METAL: 'PERCENT_OF_METAL',
} as const;
export type MakingChargeType = (typeof MakingChargeType)[keyof typeof MakingChargeType];

/** KYC document kinds captured on customers (Indian retail context). */
export const KycDocType = {
  PAN: 'PAN',
  AADHAAR: 'AADHAAR',
  GSTIN: 'GSTIN',
  PASSPORT: 'PASSPORT',
  DRIVING_LICENSE: 'DRIVING_LICENSE',
  VOTER_ID: 'VOTER_ID',
} as const;
export type KycDocType = (typeof KycDocType)[keyof typeof KycDocType];

/** Source of a metal rate row: external feed tick vs manual "rate fix" by staff. */
export const RateSource = {
  FEED: 'FEED',
  MANUAL_FIX: 'MANUAL_FIX',
} as const;
export type RateSource = (typeof RateSource)[keyof typeof RateSource];

/** Base metals traded. Purities (22K/18K/916/750…) are master data, not enum. */
export const MetalCode = {
  GOLD: 'GOLD',
  SILVER: 'SILVER',
  PLATINUM: 'PLATINUM',
} as const;
export type MetalCode = (typeof MetalCode)[keyof typeof MetalCode];

/** Inter-branch transfer lifecycle. */
export const TransferStatus = {
  IN_TRANSIT: 'IN_TRANSIT',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const;
export type TransferStatus = (typeof TransferStatus)[keyof typeof TransferStatus];

/** Item stock status derived from movements/tags. */
export const ItemStatus = {
  IN_STOCK: 'IN_STOCK',
  /** physically on hand but held for a customer/order — still counted in stock */
  RESERVED: 'RESERVED',
  SOLD: 'SOLD',
  IN_TRANSIT: 'IN_TRANSIT',
  WITH_KARIGAR: 'WITH_KARIGAR',
  SCRAPPED: 'SCRAPPED',
} as const;
export type ItemStatus = (typeof ItemStatus)[keyof typeof ItemStatus];

/** How money changed hands for an invoice payment. */
export const PaymentMode = {
  CASH: 'CASH',
  UPI: 'UPI',
  CARD: 'CARD',
  BANK_TRANSFER: 'BANK_TRANSFER',
  OTHER: 'OTHER',
} as const;
export type PaymentMode = (typeof PaymentMode)[keyof typeof PaymentMode];

/**
 * Direction of a payment row. Payments are APPEND-ONLY: a wrong payment is
 * never edited or deleted — money returned is a REFUND row.
 */
export const PaymentKind = {
  PAYMENT: 'PAYMENT',
  REFUND: 'REFUND',
} as const;
export type PaymentKind = (typeof PaymentKind)[keyof typeof PaymentKind];

/** Settlement state of a document, DERIVED from its payment rows (never stored). */
export const PaymentStatus = {
  UNPAID: 'UNPAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PAID: 'PAID',
  /** everything paid was returned (e.g. after cancellation) */
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

/** How a discount is quoted: flat paise or percent (basis points). */
export const DiscountType = {
  FLAT: 'FLAT',
  PERCENT: 'PERCENT',
} as const;
export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];

/** Procurement lifecycle: supplier → PO → goods received into a Lot. */
export const PurchaseOrderStatus = {
  DRAFT: 'DRAFT',
  ORDERED: 'ORDERED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
} as const;
export type PurchaseOrderStatus = (typeof PurchaseOrderStatus)[keyof typeof PurchaseOrderStatus];

/**
 * Customer-order lifecycle (the workshop/counter pipeline). Orders are
 * WORKFLOW objects, not financial documents — money stays on Documents;
 * an order links to its estimate/invoice via documentId.
 */
export const OrderStatus = {
  DRAFT: 'DRAFT',
  CONFIRMED: 'CONFIRMED',
  PROCESSING: 'PROCESSING',
  READY: 'READY',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
