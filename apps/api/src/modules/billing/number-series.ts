/**
 * Human-facing document numbering (INV-2026-000042).
 *
 * Identity is always the UUID; the docNumber is a per-tenant, per-series
 * DISPLAY counter required on GST invoices (consecutive numbering rule,
 * CGST Rules r.46). The counter row is incremented inside the issuing
 * transaction: PostgreSQL row-locking serializes concurrent issues, so
 * numbers are gapless per series even under contention.
 */
import { DocType, newId } from '@erp/shared';
import type { TenantTx } from '../../platform/tenancy/tenancy.service';

const PREFIX: Record<DocType, string> = {
  TAX_INVOICE: 'INV',
  ESTIMATE: 'EST',
  DELIVERY_CHALLAN: 'DC',
};

/**
 * Allocate the next number in the series for `docType` in `year`.
 * MUST be called inside the document-issue transaction.
 */
export async function nextDocNumber(tx: TenantTx, tenantId: string, docType: DocType, at: Date): Promise<string> {
  return nextSeriesNumber(tx, tenantId, PREFIX[docType], at);
}

/**
 * Generic yearly counter for any prefixed series (PO-2026-000001,
 * ORD-2026-000001, …). Same row-locking guarantees as document numbers.
 * MUST be called inside the creating transaction.
 */
export async function nextSeriesNumber(tx: TenantTx, tenantId: string, prefix: string, at: Date): Promise<string> {
  const year = at.getFullYear();
  const seriesCode = `${prefix}-${year}`;

  // Try to increment an existing counter (row-locked by the UPDATE)…
  const updated = await tx.numberSeries.updateMany({
    where: { seriesCode },
    data: { nextNumber: { increment: 1 } },
  });

  let allocated: number;
  if (updated.count === 0) {
    // …first document of this series: create the counter at 2, use 1.
    await tx.numberSeries.create({
      data: { id: newId(), tenantId, seriesCode, nextNumber: 2 },
    });
    allocated = 1;
  } else {
    const row = await tx.numberSeries.findFirstOrThrow({ where: { seriesCode } });
    allocated = row.nextNumber - 1;
  }

  return `${seriesCode}-${String(allocated).padStart(6, '0')}`;
}
