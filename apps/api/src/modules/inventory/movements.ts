/**
 * Stock-movement ledger endpoints.
 *
 * IMMUTABILITY RULE: movements are append-only. There is no update or
 * delete route — a wrong posting is corrected by POST /:id/reverse, which
 * inserts a REVERSAL row with exactly negated quantities (domain
 * `reversalOf`) linked via `reversesId`. A movement can be reversed once
 * (unique constraint on `reversesId`).
 */
import { BadRequestException, Body, Controller, Get, Injectable, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  gramsToMg,
  mgToGrams,
  MovementType,
  newId,
  Role,
  zCreateStockMovement,
  zId,
  type CreateStockMovement,
  type JwtClaims,
} from '@erp/shared';
import { CurrentUser, Roles } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { AuditService } from '../../platform/audit/audit.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ApiZodBody } from '../../platform/validation/openapi';
import { reversalOf, signedQuantities } from '../../domain/inventory/movement-rules';

const zMovementQuery = z.object({ itemId: zId.optional(), branchId: zId.optional() });

/** Movement types postable directly via this endpoint. Sale/transfer/exchange
 *  movements are only created by their owning flows (billing, transfers). */
const DIRECT_POST_TYPES: ReadonlySet<string> = new Set([
  MovementType.PURCHASE_IN,
  MovementType.ADJUSTMENT,
  MovementType.KARIGAR_ISSUE,
  MovementType.KARIGAR_RECEIPT,
]);

@Injectable()
export class MovementsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  /** Post a manual ledger entry (adjustment, karigar issue/receipt …). */
  async post(user: JwtClaims, input: CreateStockMovement) {
    if (!DIRECT_POST_TYPES.has(input.movementType)) {
      throw new BadRequestException(`${input.movementType} movements are created by their owning flow, not directly`);
    }
    const db = this.tenancy.client(user.tenantId);
    // Fixed-point normalization; gramsToMg handles the sign and throws on
    // malformed decimals.
    const q = signedQuantities(input.movementType, input.pieces, gramsToMg(input.grossWeightG));

    return db.$transaction(async (tx) => {
      // Item must exist in this tenant (scoped read enforces it).
      await tx.item.findUniqueOrThrow({ where: { id: input.itemId }, select: { id: true } });
      const row = await tx.stockMovement.create({
        data: {
          id: newId(),
          tenantId: user.tenantId,
          itemId: input.itemId,
          movementType: input.movementType,
          branchId: input.branchId,
          pieces: q.pieces,
          grossWeightG: mgToGrams(q.grossWeightMg),
          refDocumentId: input.refDocumentId ?? null,
          note: input.note ?? null,
          actorUserId: user.sub,
        },
      });
      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'StockMovement',
        entityId: row.id,
        action: 'POST',
        after: { movementType: input.movementType, pieces: q.pieces, grossWeightG: mgToGrams(q.grossWeightMg) },
      });
      return row;
    });
  }

  /** Reverse a movement: insert the exact negation, linked and audited. */
  async reverse(user: JwtClaims, movementId: string, reason: string) {
    const db = this.tenancy.client(user.tenantId);
    return db.$transaction(async (tx) => {
      const original = await tx.stockMovement.findUniqueOrThrow({ where: { id: movementId } });
      if (original.movementType === MovementType.REVERSAL) {
        throw new BadRequestException('cannot reverse a reversal — post a fresh movement instead');
      }
      const already = await tx.stockMovement.findFirst({ where: { reversesId: movementId } });
      if (already) throw new BadRequestException('movement already reversed');

      const neg = reversalOf({ pieces: original.pieces, grossWeightMg: gramsToMg(original.grossWeightG.toFixed(3)) });
      const row = await tx.stockMovement.create({
        data: {
          id: newId(),
          tenantId: user.tenantId,
          itemId: original.itemId,
          movementType: MovementType.REVERSAL,
          branchId: original.branchId,
          pieces: neg.pieces,
          grossWeightG: mgToGrams(neg.grossWeightMg),
          reversesId: original.id,
          note: reason,
          actorUserId: user.sub,
        },
      });
      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'StockMovement',
        entityId: row.id,
        action: 'REVERSE',
        before: { originalId: original.id, pieces: original.pieces },
        after: { pieces: neg.pieces, reason },
      });
      return row;
    });
  }
}

const zReverseBody = z.object({ reason: z.string().min(3).max(300) });

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('stock-movements')
export class MovementsController {
  constructor(
    private readonly movements: MovementsService,
    private readonly tenancy: TenancyService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zMovementQuery)) q: z.infer<typeof zMovementQuery>) {
    return this.tenancy.client(user.tenantId).stockMovement.findMany({
      where: { itemId: q.itemId, branchId: q.branchId },
      orderBy: { at: 'desc' },
      take: 200,
    });
  }

  @Post()
  @Roles(Role.MANAGER)
  @ApiZodBody(zCreateStockMovement)
  post(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateStockMovement)) body: CreateStockMovement) {
    return this.movements.post(user, body);
  }

  @Post(':id/reverse')
  @Roles(Role.MANAGER)
  @ApiZodBody(zReverseBody)
  reverse(
    @CurrentUser() user: JwtClaims,
    @Param('id', new ZodPipe(zId)) id: string,
    @Body(new ZodPipe(zReverseBody)) body: z.infer<typeof zReverseBody>,
  ) {
    return this.movements.reverse(user, id, body.reason);
  }
}
