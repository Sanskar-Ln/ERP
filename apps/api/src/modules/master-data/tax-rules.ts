/**
 * The configurable tax-rule matrix (see domain/tax/resolve-tax-rule.ts for
 * the resolution semantics and the business rationale).
 *
 * Tax rules are effective-dated and append-only in spirit: a rate change is
 * a NEW row (optionally closing the old row's window), so past invoices
 * remain explainable. Rule changes affect every future invoice, hence the
 * audit trail and ADMIN-only write access.
 */
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ComponentType,
  InvoiceMode,
  MaterialForm,
  newId,
  Role,
  zCreateTaxRule,
  type CreateTaxRule,
  type JwtClaims,
} from '@erp/shared';
import { CurrentUser, Roles } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { AuditService } from '../../platform/audit/audit.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ApiZodBody } from '../../platform/validation/openapi';
import { resolveTaxRule, type TaxRuleRow } from '../../domain/tax/resolve-tax-rule';

const zResolveQuery = z.object({
  componentType: z.nativeEnum(ComponentType),
  form: z.nativeEnum(MaterialForm),
  // NB: z.coerce.boolean() would turn the string "false" into true —
  // query strings need an explicit literal mapping.
  isSetInJewellery: z.enum(['true', 'false']).transform((v) => v === 'true'),
  invoiceMode: z.nativeEnum(InvoiceMode),
  at: z.coerce.date().optional(),
});

@ApiTags('master-data')
@ApiBearerAuth()
@Controller('tax-rules')
export class TaxRulesController {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtClaims) {
    return this.tenancy.client(user.tenantId).taxRule.findMany({
      include: { hsnCode: true },
      orderBy: [{ componentType: 'asc' }, { form: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiZodBody(zCreateTaxRule)
  async create(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateTaxRule)) body: CreateTaxRule) {
    const db = this.tenancy.client(user.tenantId);
    const row = await db.taxRule.create({
      data: {
        id: newId(),
        tenantId: user.tenantId,
        componentType: body.componentType,
        form: body.form,
        isSetInJewellery: body.isSetInJewellery,
        invoiceMode: body.invoiceMode,
        hsnCodeId: body.hsnCodeId ?? null,
        rateBps: body.rateBps,
        effectiveFrom: new Date(body.effectiveFrom),
        effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
        note: body.note ?? null,
      },
    });
    // Tax configuration determines invoice amounts → audited like a
    // financial mutation.
    await this.audit.log(db, {
      actorUserId: user.sub,
      entity: 'TaxRule',
      entityId: row.id,
      action: 'CREATE',
      after: { ...body },
    });
    return row;
  }

  /**
   * Dry-run the resolver: "what rate would apply to this key right now?"
   * Lets an accountant verify the matrix before invoices depend on it.
   */
  @Get('resolve')
  async resolve(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zResolveQuery)) q: z.infer<typeof zResolveQuery>) {
    const rows = await this.tenancy.client(user.tenantId).taxRule.findMany();
    const hit = resolveTaxRule(rows as unknown as TaxRuleRow[], q, q.at ?? new Date());
    return { resolved: hit, effectiveAt: q.at ?? new Date() };
  }
}
