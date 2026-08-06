/**
 * Payments against documents — the settlement side of billing.
 *
 * - POST /documents/:id/payments   record a PAYMENT or REFUND (append-only)
 * - GET  /documents/:id/payments   ledger + derived settlement summary
 *
 * IMMUTABILITY: payment rows are never updated or deleted. A mistake is
 * corrected by a REFUND row; settlement status (UNPAID / PARTIALLY_PAID /
 * PAID / REFUNDED) is always DERIVED via the pure domain summariser so it
 * can never drift from the ledger.
 *
 * RBAC: both roles record payments (taking money is the counter's job);
 * refunds are corrections and therefore ADMIN-only.
 */
import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  DocStatus,
  newId,
  PaymentKind,
  Role,
  zId,
  zRecordPayment,
  type JwtClaims,
  type RecordPayment,
} from '@erp/shared';
import { CurrentUser } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { AuditService } from '../../platform/audit/audit.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ApiZodBody } from '../../platform/validation/openapi';
import {
  assertPaymentAllowed,
  PaymentRuleError,
  summarizePayments,
  type PaymentRowInput,
} from '../../domain/payments/payment-status';

/** Shape a Prisma payment row for the pure summariser. */
const toRow = (p: { kind: string; amountPaise: bigint }): PaymentRowInput => ({
  kind: p.kind as PaymentKind,
  amountPaise: Number(p.amountPaise),
});

@Injectable()
export class PaymentsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  /** Record a payment/refund row — single tx: guard, insert, audit. */
  async record(user: JwtClaims, documentId: string, input: RecordPayment) {
    const db = this.tenancy.client(user.tenantId);
    return db.$transaction(async (tx) => {
      const doc = await tx.document.findUniqueOrThrow({
        where: { id: documentId },
        include: { payments: true },
      });
      const summary = summarizePayments(Number(doc.grandTotalPaise), doc.payments.map(toRow));
      try {
        assertPaymentAllowed(doc.status as DocStatus, input.kind, input.amountPaise, summary);
      } catch (err) {
        if (err instanceof PaymentRuleError) throw new BadRequestException(err.message);
        throw err;
      }

      const payment = await tx.payment.create({
        data: {
          id: newId(),
          tenantId: user.tenantId,
          documentId,
          kind: input.kind,
          mode: input.mode,
          amountPaise: BigInt(input.amountPaise),
          reference: input.reference ?? null,
          note: input.note ?? null,
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
          createdByUserId: user.sub,
        },
      });

      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'Payment',
        entityId: payment.id,
        action: input.kind === PaymentKind.REFUND ? 'REFUND' : 'RECORD',
        after: { documentId, docNumber: doc.docNumber, mode: input.mode, amountPaise: input.amountPaise },
      });

      const rows = [...doc.payments, payment];
      return { payment, summary: summarizePayments(Number(doc.grandTotalPaise), rows.map(toRow)) };
    });
  }

  /** Ledger + derived settlement summary for one document. */
  async list(user: JwtClaims, documentId: string) {
    const db = this.tenancy.client(user.tenantId);
    const doc = await db.document.findUniqueOrThrow({
      where: { id: documentId },
      include: { payments: { orderBy: { paidAt: 'asc' } } },
    });
    return {
      payments: doc.payments,
      summary: summarizePayments(Number(doc.grandTotalPaise), doc.payments.map(toRow)),
    };
  }
}

@ApiTags('billing')
@ApiBearerAuth()
@Controller('documents')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':id/payments')
  @ApiZodBody(zRecordPayment)
  record(
    @CurrentUser() user: JwtClaims,
    @Param('id', new ZodPipe(zId)) id: string,
    @Body(new ZodPipe(zRecordPayment)) body: RecordPayment,
  ) {
    // Refunds are corrections → ADMIN-only, enforced here (kind-dependent,
    // so a decorator on the route can't express it).
    if (body.kind === PaymentKind.REFUND && user.role !== Role.ADMIN) {
      throw new ForbiddenException('refunds are a correction — admin-only');
    }
    return this.payments.record(user, id, body);
  }

  @Get(':id/payments')
  list(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    return this.payments.list(user, id);
  }
}
