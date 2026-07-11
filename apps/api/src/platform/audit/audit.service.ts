/**
 * AuditService — the append-only audit trail.
 *
 * BUSINESS RULE: every financial mutation (document issue/cancel/convert,
 * stock movement, rate fix, exchange) MUST write an AuditLog row recording
 * actor, entity, action and before/after snapshots. Audit rows are never
 * updated or deleted.
 *
 * `log` accepts any tenant-scoped client or transaction handle so callers
 * can write the audit row inside the same transaction as the mutation —
 * an audit row without its mutation (or vice versa) must be impossible.
 */
import { Injectable } from '@nestjs/common';
import { newId } from '@erp/shared';
import type { Prisma } from '@prisma/client';

/** Minimal surface `log` needs — satisfied by TenantClient and TenantTx. */
export interface AuditWriter {
  auditLog: {
    create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown>;
  };
}

export interface AuditEntry {
  actorUserId?: string | null;
  entity: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
}

@Injectable()
export class AuditService {
  /**
   * Append an audit row via the given (tenant-scoped) client/tx.
   * tenantId is stamped by the tenancy layer; passing a raw client here
   * would fail the FK-less tenant stamp, which is intentional friction.
   */
  async log(db: AuditWriter, entry: AuditEntry): Promise<void> {
    await db.auditLog.create({
      data: {
        id: newId(),
        tenantId: '', // overwritten by the tenant-scope extension
        actorUserId: entry.actorUserId ?? null,
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        before: entry.before === undefined ? undefined : (entry.before as Prisma.InputJsonValue),
        after: entry.after === undefined ? undefined : (entry.after as Prisma.InputJsonValue),
      },
    });
  }
}
