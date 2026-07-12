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

## Rules encoded here

- **Append-only**: no update/delete endpoints; every upload writes an
  AuditLog row (entity `PaperBill`, action `UPLOAD`).
- **Storage**: local disk under `UPLOAD_DIR` (default `apps/api/uploads/`,
  gitignored). Stored file name is `uuid + real extension` — the original
  filename is display-only metadata, never a path.
- **Tenancy**: the file streams only after the PaperBill row is read
  through the tenant-scoped client, so cross-tenant file access is
  impossible even with a guessed id.
- MVP gap: no OCR of the bill contents — uploads are stored and viewable,
  not parsed. S3-style object storage is a swap of the storage layer.
