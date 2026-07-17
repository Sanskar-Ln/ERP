/**
 * Metal-rate feed + manual "rate fix".
 *
 * BUSINESS RULE: the jeweller's board rate — not the raw exchange feed —
 * is what invoices price against. Rate rows are APPEND-ONLY: a FEED tick
 * or a MANUAL_FIX inserts a new row with `effectiveAt`; billing reads the
 * latest row with `effectiveAt ≤ now` for (metal, purity). A manual fix
 * is a financially material act, so it is audited with the actor.
 * Convention: rates are paise per 10 grams (Indian bourse quoting).
 */
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { newId, RateSource, Role, zCreateMetalRate, zId, type CreateMetalRate, type JwtClaims } from '@erp/shared';
import { CurrentUser, Roles } from '../../platform/auth/auth.decorators';
import { TenancyService, type TenantClient } from '../../platform/tenancy/tenancy.service';
import { AuditService } from '../../platform/audit/audit.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ApiZodBody } from '../../platform/validation/openapi';

const zLatestQuery = z.object({ metalId: zId, purityId: zId });

/**
 * Fetch the effective board rate for (metal, purity) at `at`.
 * Exported for reuse by the billing engine — single source of rate truth.
 */
export async function latestRate(db: TenantClient, metalId: string, purityId: string, at: Date = new Date()) {
  return db.metalRate.findFirst({
    where: { metalId, purityId, effectiveAt: { lte: at } },
    orderBy: { effectiveAt: 'desc' },
  });
}

@ApiTags('master-data')
@ApiBearerAuth()
@Controller('metal-rates')
export class RatesController {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  /** Rate history, newest first. */
  @Get()
  list(@CurrentUser() user: JwtClaims) {
    return this.tenancy.client(user.tenantId).metalRate.findMany({
      orderBy: { effectiveAt: 'desc' },
      take: 200,
    });
  }

  /** The rate billing would use right now for (metal, purity). */
  @Get('latest')
  async latest(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zLatestQuery)) q: z.infer<typeof zLatestQuery>) {
    const rate = await latestRate(this.tenancy.client(user.tenantId), q.metalId, q.purityId);
    return { rate };
  }

  /** Post a rate row — FEED tick (integration) or MANUAL_FIX (board rate). */
  @Post()
  @Roles(Role.OPS)
  @ApiZodBody(zCreateMetalRate)
  async create(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateMetalRate)) body: CreateMetalRate) {
    const db = this.tenancy.client(user.tenantId);
    const row = await db.metalRate.create({
      data: {
        id: newId(),
        tenantId: user.tenantId,
        metalId: body.metalId,
        purityId: body.purityId,
        ratePaisePer10g: BigInt(body.ratePaisePer10g),
        source: body.source,
        effectiveAt: new Date(body.effectiveAt),
        note: body.note ?? null,
        createdByUserId: user.sub,
      },
    });
    if (body.source === RateSource.MANUAL_FIX) {
      await this.audit.log(db, {
        actorUserId: user.sub,
        entity: 'MetalRate',
        entityId: row.id,
        action: 'RATE_FIX',
        after: { metalId: body.metalId, purityId: body.purityId, ratePaisePer10g: body.ratePaisePer10g },
      });
    }
    return row;
  }
}
