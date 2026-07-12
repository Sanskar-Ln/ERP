# reports module

Downloadable CSVs for the store manager / accountant (RBAC: MANAGER or
ACCOUNTANT; OWNER passes). Defaults to the current month when no
`from`/`to` is given.

| Endpoint | Contents |
|----------|----------|
| `GET /reports/documents.csv?from&to&docType&branchId` | one row per bill: number, type, status, issue time, customer + phone, subtotal, discount, old-gold credit, taxable, CGST/SGST/IGST, total tax, grand total |
| `GET /reports/gst-summary.csv?from&to` | totals per GST bucket (CGST 1.5%, SGST 1.5%, IGST 3%, …) over ISSUED/CONVERTED **tax invoices** only — cancelled documents and kaccha estimates are excluded, since they carry no GST liability |

Values are exported in **rupees with two decimals** for spreadsheets;
internally everything remains integer paise and is formatted only at this
boundary. The web admin's Billing page has date-range download buttons
for both reports.
