/**
 * Tag-code rules — PURE domain logic.
 *
 * BUSINESS RULE (the whole point of this module): the barcode on a physical
 * tag encodes ONLY a stable identifier — `ITEMCODE#ORDINAL` — never price,
 * weight or rate. Selling price is resolved LIVE at scan time from the item
 * masters and today's board rate, so daily gold-rate repricing never
 * requires re-printing a single label.
 *
 * `#` is the ordinal separator because it cannot appear in an item code
 * (zCreateItem restricts codes to [A-Z0-9-]), making parsing unambiguous.
 */

const TAG_SEP = '#';
const ITEM_CODE_RE = /^[A-Z0-9-]+$/;

/**
 * Build the barcode payload for piece `ordinal` (1-based) of an item.
 * e.g. buildTagCode("RING-0001", 2) → "RING-0001#2"
 */
export function buildTagCode(itemCode: string, ordinal: number): string {
  if (!ITEM_CODE_RE.test(itemCode)) throw new RangeError(`invalid item code "${itemCode}"`);
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) throw new RangeError(`ordinal must be a positive integer, got ${ordinal}`);
  return `${itemCode}${TAG_SEP}${ordinal}`;
}

/** Parse a scanned payload back into item code + piece ordinal. */
export function parseTagCode(tagCode: string): { itemCode: string; ordinal: number } {
  const idx = tagCode.lastIndexOf(TAG_SEP);
  if (idx <= 0) throw new RangeError(`not a tag code: "${tagCode}"`);
  const itemCode = tagCode.slice(0, idx);
  const ordinal = Number(tagCode.slice(idx + 1));
  if (!ITEM_CODE_RE.test(itemCode) || !Number.isSafeInteger(ordinal) || ordinal < 1) {
    throw new RangeError(`not a tag code: "${tagCode}"`);
  }
  return { itemCode, ordinal };
}

/**
 * Assert the invariant at the boundary: a barcode payload must never look
 * like it carries a price/weight (digit-only payloads with decimals, ₹, etc.).
 * Used as a belt-and-braces check before rendering.
 */
export function assertPriceFreePayload(payload: string): void {
  if (/[₹.]|\bRS\b/i.test(payload)) {
    throw new RangeError(`barcode payload "${payload}" looks like it embeds a price — forbidden`);
  }
}
