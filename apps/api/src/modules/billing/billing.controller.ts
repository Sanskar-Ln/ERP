/**
 * Billing endpoints — the document engine's HTTP surface.
 *
 * - POST /documents            issue Tax Invoice / Estimate / Challan from a cart
 * - GET  /documents            list (filter by type/customer)
 * - GET  /documents/:id        full document graph
 * - POST /documents/:id/convert   Estimate → Tax Invoice (linkage + audit)
 * - POST /documents/:id/cancel    cancel with stock reversal (audited)
 *
 * RBAC: salespersons issue estimates and invoices (the counter flow);
 * conversion and cancellation additionally allowed to managers/accountants;
 * cancellation is manager-level only.
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
  list(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zDocQuery)) q: z.infer<typeof zDocQuery>) {
    return this.tenancy.client(user.tenantId).document.findMany({
      where: { docType: q.docType, customerId: q.customerId },
      orderBy: { issuedAt: 'desc' },
      take: 100,
    });
  }

  @Get(':id')
  get(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    return this.tenancy.client(user.tenantId).document.findUniqueOrThrow({
      where: { id },
      include: { lines: { orderBy: { lineNo: 'asc' } }, taxLines: true, exchanges: true },
    });
  }

  @Post(':id/convert')
  convert(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    return this.documents.convertEstimate(user, id);
  }

  @Post(':id/cancel')
  @Roles(Role.MANAGER)
  @ApiZodBody(zCancelDocument.pick({ reason: true }))
  cancel(
    @CurrentUser() user: JwtClaims,
    @Param('id', new ZodPipe(zId)) id: string,
    @Body(new ZodPipe(zCancelDocument.pick({ reason: true }))) body: { reason: string },
  ) {
    return this.documents.cancel(user, id, body.reason);
  }
}
