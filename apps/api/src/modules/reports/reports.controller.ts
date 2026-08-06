/**
 * Reports — downloadable CSVs for the store manager / accountant.
 *
 * - GET /reports/documents.csv?from&to&docType&branchId
 *     one row per bill: number, date, type, status, customer, taxable,
 *     CGST/SGST/IGST, total. The manager's day/period sales register.
 * - GET /reports/gst-summary.csv?from&to
 *     totals per GST bucket (label × rate) — the numbers a GST filing
 *     (GSTR-1 summary) starts from.
 * - GET /reports/sales.csv?from&to        per-day sales, tax and bill count
 * - GET /reports/payments.csv?from&to     the payment ledger, per row
 * - GET /reports/customers.csv?from&to    per-customer lifetime value + dues
 * - GET /reports/purchases.csv?from&to    purchase orders and supplier dues
 *
 * Values are exported in RUPEES with two decimals (spreadsheet-friendly);
 * internally everything stays integer paise and is only formatted at this
 * boundary. RBAC: ADMIN only.
 */
import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DocStatus, DocType, Role, zId, type JwtClaims } from '@erp/shared';
import { CurrentUser, Roles } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { summarizePayments } from '../../domain/payments/payment-status';

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
@Roles(Role.ADMIN)
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

  /** Per-DAY sales totals — the shape a manager reviews week over week. */
  @Get('sales.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="sales.csv"')
  async sales(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zReportQuery)) q: ReportQuery) {
    const { from, to } = this.bounds(q);
    const docs = await this.tenancy.client(user.tenantId).document.findMany({
      where: {
        issuedAt: { gte: from, lte: to },
        docType: DocType.TAX_INVOICE,
        status: { in: [DocStatus.ISSUED, DocStatus.CONVERTED] },
        branchId: q.branchId,
      },
      select: { issuedAt: true, taxableValuePaise: true, totalTaxPaise: true, grandTotalPaise: true },
      orderBy: { issuedAt: 'asc' },
    });
    const byDay = new Map<string, { bills: number; taxable: number; tax: number; total: number }>();
    for (const d of docs) {
      const day = d.issuedAt.toISOString().slice(0, 10);
      const r = byDay.get(day) ?? { bills: 0, taxable: 0, tax: 0, total: 0 };
      r.bills += 1;
      r.taxable += Number(d.taxableValuePaise);
      r.tax += Number(d.totalTaxPaise);
      r.total += Number(d.grandTotalPaise);
      byDay.set(day, r);
    }
    const header = ['date', 'bills', 'taxable_inr', 'tax_inr', 'total_inr'];
    const rows = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, r]) => [day, r.bills, rupees(r.taxable), rupees(r.tax), rupees(r.total)].map(cell).join(','));
    const t = [...byDay.values()].reduce(
      (s, r) => ({ bills: s.bills + r.bills, taxable: s.taxable + r.taxable, tax: s.tax + r.tax, total: s.total + r.total }),
      { bills: 0, taxable: 0, tax: 0, total: 0 },
    );
    rows.push(['TOTAL', t.bills, rupees(t.taxable), rupees(t.tax), rupees(t.total)].map(cell).join(','));
    return [header.join(','), ...rows].join('\n') + '\n';
  }

  /** The payment ledger itself — one row per payment/refund. */
  @Get('payments.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="payments.csv"')
  async payments(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zReportQuery)) q: ReportQuery) {
    const { from, to } = this.bounds(q);
    const db = this.tenancy.client(user.tenantId);
    const rows_ = await db.payment.findMany({
      where: { paidAt: { gte: from, lte: to } },
      orderBy: { paidAt: 'asc' },
    });
    const docs = await db.document.findMany({
      where: { id: { in: [...new Set(rows_.map((p) => p.documentId))] } },
      select: { id: true, docNumber: true, customerId: true },
    });
    const docById = new Map(docs.map((d) => [d.id, d]));
    const customers = await db.customer.findMany({
      where: { id: { in: [...new Set(docs.map((d) => d.customerId))] } },
      select: { id: true, name: true },
    });
    const custById = new Map(customers.map((c) => [c.id, c.name]));

    const header = ['paid_at', 'doc_number', 'customer', 'kind', 'mode', 'amount_inr', 'reference'];
    const rows = rows_.map((p) => {
      const d = docById.get(p.documentId);
      return [
        p.paidAt.toISOString(),
        d?.docNumber ?? '',
        d ? custById.get(d.customerId) ?? '' : '',
        p.kind,
        p.mode,
        rupees(p.amountPaise),
        p.reference ?? '',
      ].map(cell).join(',');
    });
    const net = rows_.reduce((s, p) => s + (p.kind === 'REFUND' ? -Number(p.amountPaise) : Number(p.amountPaise)), 0);
    rows.push(['TOTAL', '', '', '', '', rupees(net), ''].map(cell).join(','));
    return [header.join(','), ...rows].join('\n') + '\n';
  }

  /**
   * Per-customer trade summary: lifetime billed value, bills, last
   * purchase and what they still owe (derived from the payment ledger).
   */
  @Get('customers.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="customers.csv"')
  async customers(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zReportQuery)) q: ReportQuery) {
    const { from, to } = this.bounds(q);
    const db = this.tenancy.client(user.tenantId);
    const docs = await db.document.findMany({
      where: {
        issuedAt: { gte: from, lte: to },
        docType: DocType.TAX_INVOICE,
        status: { in: [DocStatus.ISSUED, DocStatus.CONVERTED] },
      },
      select: {
        id: true, customerId: true, issuedAt: true, grandTotalPaise: true,
        payments: { select: { kind: true, amountPaise: true } },
      },
    });
    const customers = await db.customer.findMany({ select: { id: true, name: true, phone: true, rateAdjustBps: true } });
    const agg = new Map<string, { bills: number; total: number; due: number; last: Date | null }>();
    for (const d of docs) {
      const a = agg.get(d.customerId) ?? { bills: 0, total: 0, due: 0, last: null };
      a.bills += 1;
      a.total += Number(d.grandTotalPaise);
      a.due += summarizePayments(
        Number(d.grandTotalPaise),
        d.payments.map((p) => ({ kind: p.kind as never, amountPaise: Number(p.amountPaise) })),
      ).duePaise;
      a.last = a.last && a.last > d.issuedAt ? a.last : d.issuedAt;
      agg.set(d.customerId, a);
    }
    const header = ['customer', 'phone', 'rate_adjust_pct', 'bills', 'billed_inr', 'outstanding_inr', 'last_purchase'];
    const rows = customers
      .map((c) => ({ c, a: agg.get(c.id) }))
      .filter((r) => r.a)
      .sort((x, y) => (y.a!.total - x.a!.total))
      .map(({ c, a }) =>
        [
          c.name, c.phone, (c.rateAdjustBps / 100).toFixed(2),
          a!.bills, rupees(a!.total), rupees(a!.due),
          a!.last ? a!.last.toISOString().slice(0, 10) : '',
        ].map(cell).join(','),
      );
    return [header.join(','), ...rows].join('\n') + '\n';
  }

  /** Procurement register: POs in the period with supplier settlement. */
  @Get('purchases.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="purchases.csv"')
  async purchases(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zReportQuery)) q: ReportQuery) {
    const { from, to } = this.bounds(q);
    const db = this.tenancy.client(user.tenantId);
    const pos = await db.purchaseOrder.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: { lines: true, supplierPayments: { select: { amountPaise: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const suppliers = await db.supplier.findMany({ select: { id: true, name: true } });
    const supById = new Map(suppliers.map((s) => [s.id, s.name]));

    const header = ['po_number', 'supplier', 'status', 'created', 'received', 'lines', 'value_inr', 'paid_inr', 'due_inr'];
    const rows = pos.map((p) => {
      const paid = p.supplierPayments.reduce((s, sp) => s + Number(sp.amountPaise), 0);
      return [
        p.poNumber,
        supById.get(p.supplierId) ?? '',
        p.status,
        p.createdAt.toISOString().slice(0, 10),
        p.receivedAt ? p.receivedAt.toISOString().slice(0, 10) : '',
        p.lines.length,
        rupees(p.totalValuePaise),
        rupees(paid),
        rupees(Math.max(0, Number(p.totalValuePaise) - paid)),
      ].map(cell).join(',');
    });
    return [header.join(','), ...rows].join('\n') + '\n';
  }
}
