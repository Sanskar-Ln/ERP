# paper-bills module

Digitized paper bills filed against customers. Jewellery shops carry
decades of handwritten/printed bills; recurring customers bring them back
for exchanges, repairs and valuations. One customer's full history =
their system-issued **Documents** (invoices/estimates) **plus** these
uploaded **PaperBills** — the web admin's Customers page shows both.

| Endpoint | What |
|----------|------|
| `POST /customers/:id/paper-bills` | multipart upload: `file` (JPEG/PNG/WebP/PDF, ≤10 MB) + optional `note`, `billDate` |
| `GET /customers/:id/paper-bills` | the customer's uploads, newest first |
| `GET /paper-bills/:id/file` | stream the file inline (only after a tenant-scoped row read) |
| `POST /paper-bills/:id/extract` | **read the bill with OCR** (tesseract.js, fully offline via npm-packaged tessdata) and extract structured fields: bill number, bill date, rupee amounts + guessed total, gram weights, per-10g rate, phone numbers. Stored on the row (`extracted`), audited, re-runnable. Images only |

## Rules encoded here

- **Append-only**: no update/delete endpoints; every upload writes an
  AuditLog row (entity `PaperBill`, action `UPLOAD`).
- **Storage**: local disk under `UPLOAD_DIR` (default `apps/api/uploads/`,
  gitignored). Stored file name is `uuid + real extension` — the original
  filename is display-only metadata, never a path.
- **Tenancy**: the file streams only after the PaperBill row is read
  through the tenant-scoped client, so cross-tenant file access is
  impossible even with a guessed id.
- **OCR is a draft, not truth**: extraction results are stored for a
  human to review and copy into the online bill — old bills are often
  handwritten and recognition is lossy, so nothing is ever auto-posted
  into billing. Field parsing is pure domain logic
  (`domain/paper-bills/parse-bill-text.ts`, unit-tested) separate from
  the OCR engine wrapper (`ocr.service.ts`).
- MVP gaps: PDFs are not rasterized for OCR (images only); S3-style
  object storage is a swap of the storage layer.
