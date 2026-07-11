/**
 * Inter-branch transfers.
 *
 * A transfer is two ledger events per item, never one:
 * - dispatch: TRANSFER_OUT at the source branch, item → IN_TRANSIT
 * - receipt:  TRANSFER_IN at the destination, item → IN_STOCK + re-homed
 * Stock is therefore always attributable to exactly one branch (or
 * explicitly in transit), and the paired movements make shrinkage in
 * transit visible as an un-received TRANSFER_OUT.
 */
import { BadRequestException, Body, Controller, Get, Injectable, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  gramsToMg,
  ItemStatus,
  mgToGrams,
  MovementType,
  newId,
  Role,
  TransferStatus,
  zCreateBranchTransfer,
  zId,
  type CreateBranchTransfer,
  type JwtClaims,
} from '@erp/shared';
import { CurrentUser, Roles } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { AuditService } from '../../platform/audit/audit.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ApiZodBody } from '../../platform/validation/openapi';
import { signedQuantities } from '../../domain/inventory/movement-rules';

@Injectable()
export class TransfersService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  /** Sum an item's gross weight (mg) across its metal components. */
  private grossMgOf(item: { metalComponents: { grossWeightG: { toFixed(dp: number): string } }[] }): number {
    return item.metalComponents.reduce((s, mc) => s + gramsToMg(mc.grossWeightG.toFixed(3)), 0);
  }

  /** Dispatch items: transfer header + TRANSFER_OUT rows + status flips. */
  async create(user: JwtClaims, input: CreateBranchTransfer) {
    if (input.fromBranchId === input.toBranchId) {
      throw new BadRequestException('source and destination branch must differ');
    }
    const db = this.tenancy.client(user.tenantId);
    const transferId = newId();

    return db.$transaction(async (tx) => {
      const items = await tx.item.findMany({
        where: { id: { in: input.itemIds } },
        include: { metalComponents: true },
      });
      if (items.length !== input.itemIds.length) throw new BadRequestException('some items not found');
      for (const it of items) {
        if (it.branchId !== input.fromBranchId) throw new BadRequestException(`item ${it.itemCode} is not at the source branch`);
        if (it.status !== ItemStatus.IN_STOCK) throw new BadRequestException(`item ${it.itemCode} is not in stock (${it.status})`);
      }

      const transfer = await tx.branchTransfer.create({
        data: {
          id: transferId,
          tenantId: user.tenantId,
          fromBranchId: input.fromBranchId,
          toBranchId: input.toBranchId,
          status: TransferStatus.IN_TRANSIT,
          note: input.note ?? null,
          createdByUserId: user.sub,
          items: {
            create: items.map((it) => ({ id: newId(), tenantId: user.tenantId, itemId: it.id })),
          },
        },
      });

      for (const it of items) {
        const q = signedQuantities(MovementType.TRANSFER_OUT, it.pieces, this.grossMgOf(it));
        await tx.stockMovement.create({
          data: {
            id: newId(),
            tenantId: user.tenantId,
            itemId: it.id,
            movementType: MovementType.TRANSFER_OUT,
            branchId: input.fromBranchId,
            pieces: q.pieces,
            grossWeightG: mgToGrams(q.grossWeightMg),
            note: `transfer ${transferId} → branch ${input.toBranchId}`,
            actorUserId: user.sub,
          },
        });
        await tx.item.update({ where: { id: it.id }, data: { status: ItemStatus.IN_TRANSIT } });
      }

      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'BranchTransfer',
        entityId: transferId,
        action: 'DISPATCH',
        after: { fromBranchId: input.fromBranchId, toBranchId: input.toBranchId, itemIds: input.itemIds },
      });
      return transfer;
    });
  }

  /** Receive a transfer: TRANSFER_IN rows, items re-homed + back in stock. */
  async receive(user: JwtClaims, transferId: string) {
    const db = this.tenancy.client(user.tenantId);
    return db.$transaction(async (tx) => {
      const transfer = await tx.branchTransfer.findUniqueOrThrow({
        where: { id: transferId },
        include: { items: true },
      });
      if (transfer.status !== TransferStatus.IN_TRANSIT) {
        throw new BadRequestException(`transfer is ${transfer.status}, not IN_TRANSIT`);
      }

      for (const ti of transfer.items) {
        const item = await tx.item.findUniqueOrThrow({
          where: { id: ti.itemId },
          include: { metalComponents: true },
        });
        const q = signedQuantities(MovementType.TRANSFER_IN, item.pieces, this.grossMgOf(item));
        await tx.stockMovement.create({
          data: {
            id: newId(),
            tenantId: user.tenantId,
            itemId: item.id,
            movementType: MovementType.TRANSFER_IN,
            branchId: transfer.toBranchId,
            pieces: q.pieces,
            grossWeightG: mgToGrams(q.grossWeightMg),
            note: `transfer ${transferId} received`,
            actorUserId: user.sub,
          },
        });
        await tx.item.update({
          where: { id: item.id },
          data: { status: ItemStatus.IN_STOCK, branchId: transfer.toBranchId },
        });
      }

      const updated = await tx.branchTransfer.update({
        where: { id: transferId },
        data: { status: TransferStatus.RECEIVED, receivedAt: new Date() },
      });
      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'BranchTransfer',
        entityId: transferId,
        action: 'RECEIVE',
        after: { toBranchId: transfer.toBranchId, itemCount: transfer.items.length },
      });
      return updated;
    });
  }
}

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('transfers')
export class TransfersController {
  constructor(
    private readonly transfers: TransfersService,
    private readonly tenancy: TenancyService,
  ) {}

  @Get()
  list(@CurrentUser() user: JwtClaims) {
    return this.tenancy.client(user.tenantId).branchTransfer.findMany({
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post()
  @Roles(Role.MANAGER)
  @ApiZodBody(zCreateBranchTransfer)
  create(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateBranchTransfer)) body: CreateBranchTransfer) {
    return this.transfers.create(user, body);
  }

  @Post(':id/receive')
  @Roles(Role.MANAGER)
  receive(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    return this.transfers.receive(user, id);
  }
}
