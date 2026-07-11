# tagging module

Per-piece tags, server-side barcodes (bwip-js), label templates and batch
label sheets. Pure tag-code rules live in `domain/tagging/tag-code.ts`.

| File | Endpoints | Notes |
|------|-----------|-------|
| `tags.ts` | `/tags`, `/tags/scan/:tagCode`, `/tags/:id/barcode.png` | one tag per physical piece, `ITEMCODE#ordinal`; PNG via bwip-js — Code128 default, DataMatrix option |
| `labels.ts` | `/label-templates`, `/label-batches`, `/label-batches/:id/render` | template = mm size + symbology + ordered fields; batch renders a printable HTML sheet with data-URI barcode PNGs |

## THE business rule

**The barcode never encodes price** — only the stable tag code
(`ITEMCODE#ordinal`). Selling price is resolved at scan time from the item
masters + today's board rate. Consequence: the daily gold-rate change
(repricing) never requires reprinting a label. This is triple-enforced:

1. `buildTagCode` only accepts item code + ordinal (domain),
2. `assertPriceFreePayload` rejects price-looking payloads at the render
   boundary,
3. label PRICE_TEXT prints a static "as per today's rate" marker, not a
   number.

Tag counts are capped at the item's piece count (over-tagging blocked);
ordinals continue after existing tags so extra pieces never collide.
