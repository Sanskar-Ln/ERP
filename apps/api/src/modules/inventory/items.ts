/**
 * Composite inventory items.
 *
 * An item = metal component(s) + stone component(s) + a making-charge rule.
 * Creation is one transaction: item + components + the opening PURCHASE_IN
 * stock movement + audit row — stock can never exist without its ledger
 * entry, and vice versa.
 *
 * Dual-unit rule: both `pieces` and gross weight enter the ledger. Weight
 * validation (net ≤ gross, non-negative after stone deduction) uses the
 * shared fixed-point math — no floats.
 */
import { BadRequestException, Body, Controller, Get, Injectable, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  gramsToMg,
  mgToGrams,
  ItemStatus,
  MovementType,
  newId,
  Role,
  zCreateItem,
  zCreateLot,
  zId,
  type CreateItem,
  type CreateLot,
  type JwtClaims,
} from '@erp/shared';
import { CurrentUser, Roles } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { AuditService } from '../../platform/audit/audit.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ApiZodBody } from '../../platform/validation/openapi';
import { signedQuantities } from '../../domain/inventory/movement-rules';

const zItemQuery = z.object({
  branchId: zId.optional(),
  status: z.nativeEnum(ItemStatus).optional(),
  q: z.string().max(120).optional(),
});

@Injectable()
export class ItemsService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Create a composite item with its opening stock movement, atomically.
   * Validates dual-unit weight consistency before touching the DB.
   */
  async createItem(user: JwtClaims, input: CreateItem) {
    // ---- weight sanity (fixed-point mg math; throws on bad decimals) ----
    let totalGrossMg = 0;
    for (const mc of input.metalComponents) {
      const gross = gramsToMg(mc.grossWeightG);
      const net = gramsToMg(mc.netWeightG);
      if (net > gross) {
        throw new BadRequestException(`metal component net (${mc.netWeightG}g) exceeds gross (${mc.grossWeightG}g)`);
      }
      totalGrossMg += gross;
    }
    if (input.metalComponents.length === 0 && input.stoneComponents.length === 0) {
      throw new BadRequestException('an item needs at least one metal or stone component');
    }

    const db = this.tenancy.client(user.tenantId);
    const itemId = newId();
    const tenantId = user.tenantId;

    const item = await db.$transaction(async (tx) => {
      const created = await tx.item.create({
        data: {
          id: itemId,
          tenantId,
          itemCode: input.itemCode,
          name: input.name,
          description: input.description ?? null,
          branchId: input.branchId,
          lotId: input.lotId ?? null,
          hsnCodeId: input.hsnCodeId,
          pieces: input.pieces,
          makingChargeType: input.makingCharge.type,
          makingChargeValue: BigInt(input.makingCharge.value),
          isStudded: input.isStudded,
          isPrecious: input.isPrecious,
          status: ItemStatus.IN_STOCK,
          metalComponents: {
            create: input.metalComponents.map((mc) => ({
              id: newId(),
              tenantId,
              metalId: mc.metalId,
              purityId: mc.purityId,
              grossWeightG: mc.grossWeightG,
              netWeightG: mc.netWeightG,
              wastageBps: mc.wastageBps,
            })),
          },
          stoneComponents: {
            create: input.stoneComponents.map((sc) => ({
              id: newId(),
              tenantId,
              stoneTypeId: sc.stoneTypeId,
              pieces: sc.pieces,
              weightCt: sc.weightCt,
              weightRatti: sc.weightRatti ?? null,
              cut: sc.fourC?.cut ?? null,
              color: sc.fourC?.color ?? null,
              clarity: sc.fourC?.clarity ?? null,
              certLab: sc.certificate?.lab ?? null,
              certNo: sc.certificate?.certificateNo ?? null,
              ratePaisePerCarat: sc.ratePaisePerCarat != null ? BigInt(sc.ratePaisePerCarat) : null,
              valuePaise: BigInt(sc.valuePaise),
            })),
          },
        },
        include: { metalComponents: true, stoneComponents: true },
      });

      // Opening ledger entry — dual-unit, sign forced by movement type.
      const q = signedQuantities(MovementType.PURCHASE_IN, input.pieces, totalGrossMg);
      await tx.stockMovement.create({
        data: {
          id: newId(),
          tenantId,
          itemId,
          movementType: MovementType.PURCHASE_IN,
          branchId: input.branchId,
          pieces: q.pieces,
          grossWeightG: mgToGrams(q.grossWeightMg),
          actorUserId: user.sub,
          note: 'opening stock (item creation)',
        },
      });

      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'Item',
        entityId: itemId,
        action: 'CREATE',
        after: { itemCode: input.itemCode, pieces: input.pieces, branchId: input.branchId },
      });

      return created;
    });

    return item;
  }
}

@ApiTags('inventory')
@ApiBearerAuth()
@Controller()
export class ItemsController {
  constructor(
    private readonly items: ItemsService,
    private readonly tenancy: TenancyService,
  ) {}

  @Post('items')
  @Roles(Role.MANAGER)
  @ApiZodBody(zCreateItem)
  create(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateItem)) body: CreateItem) {
    return this.items.createItem(user, body);
  }

  @Get('items')
  list(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zItemQuery)) q: z.infer<typeof zItemQuery>) {
    return this.tenancy.client(user.tenantId).item.findMany({
      where: {
        branchId: q.branchId,
        status: q.status,
        ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { itemCode: { contains: q.q.toUpperCase() } }] } : {}),
      },
      include: { metalComponents: true, stoneComponents: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Scanner lookup: resolve a barcode's item code to the full item. */
  @Get('items/by-code/:itemCode')
  byCode(@CurrentUser() user: JwtClaims, @Param('itemCode') itemCode: string) {
    return this.tenancy.client(user.tenantId).item.findFirstOrThrow({
      where: { itemCode },
      include: { metalComponents: true, stoneComponents: true, tags: true },
    });
  }

  @Get('items/:id')
  get(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    return this.tenancy.client(user.tenantId).item.findUniqueOrThrow({
      where: { id },
      include: { metalComponents: true, stoneComponents: true, tags: true, lot: true },
    });
  }

  // ------------------------------------------------------------ lots

  @Get('lots')
  listLots(@CurrentUser() user: JwtClaims) {
    return this.tenancy.client(user.tenantId).lot.findMany({ orderBy: { receivedAt: 'desc' }, take: 100 });
  }

  @Post('lots')
  @Roles(Role.MANAGER)
  @ApiZodBody(zCreateLot)
  createLot(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateLot)) body: CreateLot) {
    return this.tenancy.client(user.tenantId).lot.create({
      data: {
        id: newId(),
        tenantId: user.tenantId,
        lotNo: body.lotNo,
        supplierId: body.supplierId ?? null,
        karigarId: body.karigarId ?? null,
        receivedAt: new Date(body.receivedAt),
        note: body.note ?? null,
      },
    });
  }
}
