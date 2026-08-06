# tagging module

Per-piece tags, server-side barcodes (bwip-js), millimetre label designs,
printer profiles and printing. Pure rules live in `domain/tagging/`:
`tag-code.ts` (payload), `label-layout.ts` (geometry) and
`renderers/{zpl,tspl,html}.ts` (output).

| File | Endpoints | Notes |
|------|-----------|-------|
| `tags.ts` | `/tags`, `/tags/scan/:tagCode`, `/tags/:id/barcode.png` | one tag per physical piece, `ITEMCODE#ordinal`; PNG via bwip-js — Code128 default, DataMatrix option |
| `labels.ts` | `/label-templates`, `/label-batches`, `/label-batches/:id/{render,raw,print}`, `/printers`, `/printers/:id/identify` | designs in mm (rectangle or dumbbell); batches render to HTML, ZPL or TSPL |
| `printers.ts` | — (service) | socket probe + send; `classifyIdentity` maps a printer's reply to a language |

## Nothing is coupled to a printer

A label is designed **once, in millimetres** and knows nothing about the
hardware. `layoutLabel()` turns a template + tag into device-independent
elements; interchangeable renderers emit ZPL (Zebra), TSPL (TSC/Godex/
Argox) or HTML (any driver the shop PC already has). That is why a design
made today prints on a printer bought next year.

**Identification**: a printer may be registered with `language: AUTO`
before anyone knows its brand. `POST /printers/:id/identify` opens a
socket and asks — Zebra answers `~HI` with `<model>,<firmware>,…`, TSPL
units answer `~!T` — and the reply resolves the language. An unrecognised
dialect stays `AUTO` rather than guessing and printing garbage.

**Delivery** (`connection`): `BROWSER` returns HTML for the shop PC's own
driver (zero setup); `DOWNLOAD` hands back the raw command file;
`NETWORK` pushes bytes to `host:9100` — LAN deployments only, since a
cloud-hosted API cannot reach a printer on the shop's network.

## Dumbbell tags

The jewellery "butterfly" tag is two printable flags joined by a neck that
wraps the ring shank or chain. `leftFlagMm + neckMm + rightFlagMm` must
equal `widthMm` (enforced in zod *and* in `regionsOf`), and the layout
engine never places anything on the neck — print there and the wrap hides
it. Fields choose their flag with `region: LEFT | RIGHT`.

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
