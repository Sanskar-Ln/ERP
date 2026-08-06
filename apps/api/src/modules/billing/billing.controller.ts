/**
 * Billing endpoints — the document engine's HTTP surface.
 *
 * - POST /documents            issue Tax Invoice / Estimate / Challan from a cart
 * - GET  /documents            list (filter by type/customer)
 * - GET  /documents/:id        full document graph
 * - POST /documents/:id/convert   Estimate → Tax Invoice (linkage + audit)
 * - POST /documents/:id/cancel    cancel with stock reversal (audited)
 *
 * RBAC: any authenticated user (OPS) issues and converts documents — the
 * counter flow; cancellation is a correction and therefore ADMIN-only.
 */
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  DocType,
  Role,
  zCancelDocument,
  zCreateDocument,
  zId,
  type CreateDocument,
  type JwtClaims,
} from '@erp/shared';
import { CurrentUser, Roles } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ApiZodBody } from '../../platform/validation/openapi';
import { summarizePayments } from '../../domain/payments/payment-status';
import { DocumentsService } from './documents.service';

const zDocQuery = z.object({
  docType: z.nativeEnum(DocType).optional(),
  customerId: zId.optional(),
});

@ApiTags('billing')
@ApiBearerAuth()
@Controller('documents')
export class BillingController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly tenancy: TenancyService,
  ) {}

  @Post()
  @ApiZodBody(zCreateDocument)
  issue(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateDocument)) body: CreateDocument) {
    return this.documents.issue(user, body.docType, body.cart);
  }

  @Get()
  async list(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zDocQuery)) q: z.infer<typeof zDocQuery>) {
    const docs = await this.tenancy.client(user.tenantId).document.findMany({
      where: { docType: q.docType, customerId: q.customerId },
      orderBy: { issuedAt: 'desc' },
      take: 100,
      include: { payments: { select: { kind: true, amountPaise: true } } },
    });
    // Attach the DERIVED settlement summary; strip the raw rows from the list.
    return docs.map(({ payments, ...doc }) => ({
      ...doc,
      paymentSummary: summarizePayments(
        Number(doc.grandTotalPaise),
        payments.map((p) => ({ kind: p.kind as never, amountPaise: Number(p.amountPaise) })),
      ),
    }));
  }

  @Get(':id')
  async get(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    const doc = await this.tenancy.client(user.tenantId).document.findUniqueOrThrow({
      where: { id },
      include: {
        lines: { orderBy: { lineNo: 'asc' } },
        taxLines: true,
        exchanges: true,
        payments: { orderBy: { paidAt: 'asc' } },
      },
    });
    return {
      ...doc,
      paymentSummary: summarizePayments(
        Number(doc.grandTotalPaise),
        doc.payments.map((p) => ({ kind: p.kind as never, amountPaise: Number(p.amountPaise) })),
      ),
    };
  }

  @Post(':id/convert')
  convert(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    return this.documents.convertEstimate(user, id);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN)
  @ApiZodBody(zCancelDocument.pick({ reason: true }))
  cancel(
    @CurrentUser() user: JwtClaims,
    @Param('id', new ZodPipe(zId)) id: string,
    @Body(new ZodPipe(zCancelDocument.pick({ reason: true }))) body: { reason: string },
  ) {
    return this.documents.cancel(user, id, body.reason);
  }
}
