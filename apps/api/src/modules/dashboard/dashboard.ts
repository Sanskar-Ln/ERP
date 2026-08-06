/**
 * Dashboard metrics — the "how is the shop doing right now" endpoint.
 *
 * GET /dashboard/metrics?from&to  (both roles; OPS sees the same counter
 * numbers it already works with — nothing here is admin-privileged data
 * beyond what the pages themselves show.)
 *
 * Every money figure is integer paise, computed from the SAME sources the
 * documents/payments pages use, so the tiles can never disagree with the
 * lists: sales come from issued tax invoices, settlement from the
 * append-only payment ledger via the pure summariser, stock from item
 * status counts, orders from the pipeline, purchases from received POs.
 */
import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { DocStatus, DocType, ItemStatus, OrderStatus, type JwtClaims } from '@erp/shared';
import { CurrentUser } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { summarizePayments } from '../../domain/payments/payment-status';

const zMetricsQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** IN_STOCK pieces at or below this count flag a low-stock category */
  lowStockThreshold: z.coerce.number().int().min(0).max(1000).default(2),
});
type MetricsQuery = z.infer<typeof zMetricsQuery>;

/** Live (non-cancelled) sales documents. */
const LIVE_STATUSES = [DocStatus.ISSUED, DocStatus.CONVERTED];

/** Orders that no longer sit in the workshop queue. */
const CLOSED_ORDER_STATUSES: ReadonlySet<string> = new Set([
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
]);

@Injectable()
export class DashboardService {
  constructor(private readonly tenancy: TenancyService) {}

  async metrics(user: JwtClaims, q: MetricsQuery) {
    const db = this.tenancy.client(user.tenantId);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const from = q.from ?? startOfToday;
    const to = q.to ?? now;

    // ---- sales in the window + today (invoices only; kaccha docs excluded)
    const invoices = await db.document.findMany({
      where: { docType: DocType.TAX_INVOICE, status: { in: LIVE_STATUSES } },
      select: { id: true, issuedAt: true, grandTotalPaise: true, totalTaxPaise: true },
    });
    const inWindow = invoices.filter((d) => d.issuedAt >= from && d.issuedAt <= to);
    const today = invoices.filter((d) => d.issuedAt >= startOfToday);
    const sum = (rows: { grandTotalPaise: bigint }[]) => rows.reduce((s, d) => s + Number(d.grandTotalPaise), 0);

    // ---- settlement across ALL live invoices (receivables are not
    // window-bound: an old unpaid bill is still money owed today)
    const payments = await db.payment.findMany({
      select: { documentId: true, kind: true, amountPaise: true, paidAt: true },
    });
    const byDoc = new Map<string, { kind: string; amountPaise: bigint }[]>();
    for (const p of payments) {
      const list = byDoc.get(p.documentId) ?? [];
      list.push(p);
      byDoc.set(p.documentId, list);
    }
    let receivablePaise = 0;
    let unpaidCount = 0;
    for (const inv of invoices) {
      const s = summarizePayments(
        Number(inv.grandTotalPaise),
        (byDoc.get(inv.id) ?? []).map((p) => ({ kind: p.kind as never, amountPaise: Number(p.amountPaise) })),
      );
      receivablePaise += s.duePaise;
      if (s.duePaise > 0) unpaidCount += 1;
    }
    const collectedTodayPaise = payments
      .filter((p) => p.paidAt >= startOfToday)
      .reduce((s, p) => s + (p.kind === 'REFUND' ? -Number(p.amountPaise) : Number(p.amountPaise)), 0);

    // ---- stock position by status + low-stock categories
    const stockByStatus = await db.item.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { pieces: true },
    });
    const inStockByCategory = await db.item.groupBy({
      by: ['category'],
      where: { status: { in: [ItemStatus.IN_STOCK, ItemStatus.RESERVED] } },
      _sum: { pieces: true },
    });
    const lowStock = inStockByCategory
      .filter((c) => (c._sum.pieces ?? 0) <= q.lowStockThreshold)
      .map((c) => ({ category: c.category ?? '(uncategorised)', pieces: c._sum.pieces ?? 0 }));

    // ---- order pipeline (open = not delivered/completed/cancelled)
    const ordersByStatus = await db.order.groupBy({ by: ['status'], _count: { _all: true } });
    const openOrders = ordersByStatus
      .filter((o) => !CLOSED_ORDER_STATUSES.has(o.status))
      .reduce((s, o) => s + o._count._all, 0);

    // ---- procurement in the window + outstanding supplier dues
    const pos = await db.purchaseOrder.findMany({
      where: { status: { not: 'CANCELLED' } },
      select: { receivedAt: true, totalValuePaise: true, supplierPayments: { select: { amountPaise: true } } },
    });
    const purchasedPaise = pos
      .filter((p) => p.receivedAt && p.receivedAt >= from && p.receivedAt <= to)
      .reduce((s, p) => s + Number(p.totalValuePaise), 0);
    const supplierDuePaise = pos.reduce((s, p) => {
      const paid = p.supplierPayments.reduce((a, sp) => a + Number(sp.amountPaise), 0);
      return s + Math.max(0, Number(p.totalValuePaise) - paid);
    }, 0);

    return {
      window: { from: from.toISOString(), to: to.toISOString() },
      sales: {
        todayPaise: sum(today),
        todayCount: today.length,
        windowPaise: sum(inWindow),
        windowCount: inWindow.length,
        windowTaxPaise: inWindow.reduce((s, d) => s + Number(d.totalTaxPaise), 0),
      },
      payments: {
        collectedTodayPaise,
        receivablePaise,
        unpaidInvoiceCount: unpaidCount,
      },
      stock: {
        byStatus: stockByStatus.map((r) => ({
          status: r.status,
          items: r._count._all,
          pieces: r._sum.pieces ?? 0,
        })),
        lowStock,
      },
      orders: {
        open: openOrders,
        byStatus: ordersByStatus.map((o) => ({ status: o.status, count: o._count._all })),
      },
      purchases: { windowPaise: purchasedPaise, supplierDuePaise },
    };
  }
}

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('metrics')
  metrics(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zMetricsQuery)) q: MetricsQuery) {
    return this.dashboard.metrics(user, q);
  }
}
