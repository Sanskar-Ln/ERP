/**
 * Reports — downloadable CSVs for the store manager / accountant.
 *
 * - GET /reports/documents.csv?from&to&docType&branchId
 *     one row per bill: number, date, type, status, customer, taxable,
 *     CGST/SGST/IGST, total. The manager's day/period sales register.
 * - GET /reports/gst-summary.csv?from&to
 *     totals per GST bucket (label × rate) — the numbers a GST filing
 *     (GSTR-1 summary) starts from.
 *
 * Values are exported in RUPEES with two decimals (managers open these in
 * Excel/Sheets); internally everything stays integer paise and is only
 * formatted at this boundary. RBAC: MANAGER or ACCOUNTANT (OWNER passes).
 */
import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DocType, Role, zId, type JwtClaims } from '@erp/shared';
import { CurrentUser, Roles } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';

const zReportQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  docType: z.nativeEnum(DocType).optional(),
  branchId: zId.optional(),
});
type ReportQuery = z.infer<typeof zReportQuery>;

/** Escape one CSV cell (quotes, commas, newlines). */
const cell = (v: string | number | null | undefined): string => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Integer paise → "12345.50" rupee string for spreadsheets. */
const rupees = (paise: number | bigint): string => (Number(paise) / 100).toFixed(2);

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
@Roles(Role.MANAGER, Role.ACCOUNTANT)
export class ReportsController {
  constructor(private readonly tenancy: TenancyService) {}

  /** Period bounds: default = current month to now. */
  private bounds(q: ReportQuery): { from: Date; to: Date } {
    const now = new Date();
    return {
      from: q.from ?? new Date(now.getFullYear(), now.getMonth(), 1),
      to: q.to ?? now,
    };
  }

  @Get('documents.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="documents.csv"')
  async documents(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zReportQuery)) q: ReportQuery) {
    const { from, to } = this.bounds(q);
    const db = this.tenancy.client(user.tenantId);
    const docs = await db.document.findMany({
      where: {
        issuedAt: { gte: from, lte: to },
        docType: q.docType,
        branchId: q.branchId,
      },
      include: { taxLines: true },
      orderBy: { issuedAt: 'asc' },
    });
    const customers = await db.customer.findMany({
      where: { id: { in: [...new Set(docs.map((d) => d.customerId))] } },
      select: { id: true, name: true, phone: true },
    });
    const custById = new Map(customers.map((c) => [c.id, c]));

    const sumKind = (d: (typeof docs)[number], kind: string): string =>
      rupees(d.taxLines.filter((t) => t.kind === kind).reduce((s, t) => s + Number(t.taxPaise), 0));

    const header = [
      'doc_number', 'type', 'status', 'issued_at', 'customer', 'customer_phone',
      'subtotal_inr', 'discount_inr', 'old_gold_inr', 'taxable_inr',
      'cgst_inr', 'sgst_inr', 'igst_inr', 'total_tax_inr', 'grand_total_inr',
    ];
    const rows = docs.map((d) => {
      const c = custById.get(d.customerId);
      return [
        d.docNumber, d.docType, d.status, d.issuedAt.toISOString(),
        c?.name ?? '', c?.phone ?? '',
        rupees(d.subtotalPaise), rupees(d.discountPaise), rupees(d.exchangeValuePaise),
        rupees(d.taxableValuePaise),
        sumKind(d, 'CGST'), sumKind(d, 'SGST'), sumKind(d, 'IGST'),
        rupees(d.totalTaxPaise), rupees(d.grandTotalPaise),
      ].map(cell).join(',');
    });
    return [header.join(','), ...rows].join('\n') + '\n';
  }

  @Get('gst-summary.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="gst-summary.csv"')
  async gstSummary(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zReportQuery)) q: ReportQuery) {
    const { from, to } = this.bounds(q);
    const db = this.tenancy.client(user.tenantId);
    // Only ISSUED/CONVERTED tax invoices contribute to GST liability —
    // cancelled documents and kaccha estimates are excluded.
    const taxLines = await db.documentTaxLine.findMany({
      where: {
        document: {
          issuedAt: { gte: from, lte: to },
          docType: DocType.TAX_INVOICE,
          status: { in: ['ISSUED', 'CONVERTED'] },
        },
      },
    });
    const buckets = new Map<string, { taxable: number; tax: number; count: number }>();
    for (const t of taxLines) {
      const b = buckets.get(t.label) ?? { taxable: 0, tax: 0, count: 0 };
      b.taxable += Number(t.taxablePaise);
      b.tax += Number(t.taxPaise);
      b.count += 1;
      buckets.set(t.label, b);
    }
    const header = ['tax_label', 'lines', 'taxable_inr', 'tax_inr'];
    const rows = [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, b]) => [label, b.count, rupees(b.taxable), rupees(b.tax)].map(cell).join(','));
    const totalTax = [...buckets.values()].reduce((s, b) => s + b.tax, 0);
    rows.push(['TOTAL', '', '', rupees(totalTax)].map(cell).join(','));
    return [header.join(','), ...rows].join('\n') + '\n';
  }
}
