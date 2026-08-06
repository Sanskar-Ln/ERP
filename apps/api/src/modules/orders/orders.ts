/**
 * Customer orders — the counter/workshop pipeline.
 *
 * An Order is a WORKFLOW object, not a financial document: money lives on
 * Documents (estimate/invoice), linked via `documentId`. The lifecycle is
 * a one-way state machine (pure domain/orders/transitions):
 *
 *   DRAFT → CONFIRMED → PROCESSING → READY → DELIVERED → COMPLETED
 *                    (CANCELLED from any pre-DELIVERED state)
 *
 * Stock coupling:
 * - CONFIRMED reserves every stock-item line (IN_STOCK → RESERVED with a
 *   zero-quantity RESERVE ledger annotation);
 * - CANCELLED releases those reservations;
 * - DELIVERED requires a linked billing document (the goods leave against
 *   paper, never against a workflow state alone).
 *
 * RBAC: creating and advancing orders is counter work (both roles);
 * cancellation is a correction → ADMIN-only.
 */
import { BadRequestException, Body, Controller, ForbiddenException, Get, Injectable, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  ItemStatus,
  MovementType,
  mgToGrams,
  newId,
  OrderStatus,
  Role,
  zAdvanceOrder,
  zCreateOrder,
  zId,
  type AdvanceOrder,
  type CreateOrder,
  type JwtClaims,
} from '@erp/shared';
import { CurrentUser } from '../../platform/auth/auth.decorators';
import { TenancyService, type TenantTx } from '../../platform/tenancy/tenancy.service';
import { AuditService } from '../../platform/audit/audit.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ApiZodBody } from '../../platform/validation/openapi';
import { signedQuantities } from '../../domain/inventory/movement-rules';
import { assertOrderTransition, TransitionError } from '../../domain/orders/transitions';
import { nextSeriesNumber } from '../billing/number-series';

const zOrderQuery = z.object({
  status: z.nativeEnum(OrderStatus).optional(),
  customerId: zId.optional(),
});

@Injectable()
export class OrdersService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  async create(user: JwtClaims, input: CreateOrder) {
    const db = this.tenancy.client(user.tenantId);
    const now = new Date();
    return db.$transaction(async (tx) => {
      await tx.customer.findUniqueOrThrow({ where: { id: input.customerId } });
      // Validate stock lines up front; made-to-order lines need a description.
      const lines = [];
      let lineNo = 0;
      for (const l of input.lines) {
        lineNo += 1;
        if (l.itemId) {
          const item = await tx.item.findUniqueOrThrow({ where: { id: l.itemId } });
          if (item.status !== ItemStatus.IN_STOCK) {
            throw new BadRequestException(`item ${item.itemCode} is not available (${item.status})`);
          }
          lines.push({ lineNo, itemId: item.id, description: l.description ?? `${item.name} [${item.itemCode}]`, pieces: l.pieces, expectedWeightG: l.expectedWeightG ?? null });
        } else {
          if (!l.description) throw new BadRequestException(`line ${lineNo}: made-to-order lines need a description`);
          lines.push({ lineNo, itemId: null, description: l.description, pieces: l.pieces, expectedWeightG: l.expectedWeightG ?? null });
        }
      }
      const orderNumber = await nextSeriesNumber(tx, user.tenantId, 'ORD', now);
      const order = await tx.order.create({
        data: {
          id: newId(),
          tenantId: user.tenantId,
          orderNumber,
          customerId: input.customerId,
          branchId: input.branchId,
          note: input.note ?? null,
          createdByUserId: user.sub,
          lines: {
            create: lines.map((l) => ({ id: newId(), tenantId: user.tenantId, ...l })),
          },
        },
        include: { lines: { orderBy: { lineNo: 'asc' } } },
      });
      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'Order',
        entityId: order.id,
        action: 'CREATE',
        after: { orderNumber, customerId: input.customerId, lines: lines.length },
      });
      return order;
    });
  }

  async advance(user: JwtClaims, id: string, input: AdvanceOrder) {
    if (input.to === OrderStatus.CANCELLED && user.role !== Role.ADMIN) {
      throw new ForbiddenException('cancelling an order is admin-only');
    }
    const db = this.tenancy.client(user.tenantId);
    return db.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      try {
        assertOrderTransition(order.status as OrderStatus, input.to);
      } catch (err) {
        if (err instanceof TransitionError) throw new BadRequestException(err.message);
        throw err;
      }

      const documentId = input.documentId ?? order.documentId;
      if (input.to === OrderStatus.DELIVERED && !documentId) {
        throw new BadRequestException('delivering needs a linked billing document (documentId)');
      }
      if (input.documentId) {
        await tx.document.findUniqueOrThrow({ where: { id: input.documentId } });
      }

      // Stock coupling: hold the goods on confirm, free them on cancel.
      if (input.to === OrderStatus.CONFIRMED) {
        await this.setLineReservations(tx, user, order, true);
      }
      if (input.to === OrderStatus.CANCELLED) {
        await this.setLineReservations(tx, user, order, false);
      }

      const updated = await tx.order.update({
        where: { id },
        data: {
          status: input.to,
          documentId: documentId ?? null,
          ...(input.to === OrderStatus.CANCELLED ? { cancelReason: input.reason ?? null } : {}),
        },
        include: { lines: { orderBy: { lineNo: 'asc' } } },
      });

      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'Order',
        entityId: id,
        action: input.to,
        before: { status: order.status },
        after: { status: input.to, documentId: documentId ?? null, reason: input.reason },
      });
      return updated;
    });
  }

  /** Reserve (or release) every stock-item line of the order. */
  private async setLineReservations(
    tx: TenantTx,
    user: JwtClaims,
    order: { id: string; orderNumber: string; branchId: string; lines: { itemId: string | null }[] },
    reserve: boolean,
  ): Promise<void> {
    for (const line of order.lines) {
      if (!line.itemId) continue;
      const item = await tx.item.findUniqueOrThrow({ where: { id: line.itemId } });
      if (reserve) {
        // Item may have been sold/reserved since DRAFT — confirming then fails.
        if (item.status !== ItemStatus.IN_STOCK) {
          throw new BadRequestException(`item ${item.itemCode} is no longer available (${item.status})`);
        }
      } else if (item.status !== ItemStatus.RESERVED) {
        continue; // e.g. already invoiced (SOLD) — nothing to release
      }
      const movementType = reserve ? MovementType.RESERVE : MovementType.UNRESERVE;
      const q = signedQuantities(movementType, 0, 0);
      await tx.stockMovement.create({
        data: {
          id: newId(),
          tenantId: user.tenantId,
          itemId: item.id,
          movementType,
          branchId: item.branchId,
          pieces: q.pieces,
          grossWeightG: mgToGrams(q.grossWeightMg),
          note: `${reserve ? 'reserved for' : 'released from'} order ${order.orderNumber}`,
          actorUserId: user.sub,
        },
      });
      await tx.item.update({
        where: { id: item.id },
        data: { status: reserve ? ItemStatus.RESERVED : ItemStatus.IN_STOCK },
      });
    }
  }
}

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly tenancy: TenancyService,
  ) {}

  @Post()
  @ApiZodBody(zCreateOrder)
  create(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreateOrder)) body: CreateOrder) {
    return this.orders.create(user, body);
  }

  @Get()
  list(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zOrderQuery)) q: z.infer<typeof zOrderQuery>) {
    return this.tenancy.client(user.tenantId).order.findMany({
      where: { status: q.status, customerId: q.customerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
  }

  @Get(':id')
  get(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    return this.tenancy.client(user.tenantId).order.findUniqueOrThrow({
      where: { id },
      include: { lines: { orderBy: { lineNo: 'asc' } } },
    });
  }

  @Post(':id/status')
  @ApiZodBody(zAdvanceOrder)
  advance(
    @CurrentUser() user: JwtClaims,
    @Param('id', new ZodPipe(zId)) id: string,
    @Body(new ZodPipe(zAdvanceOrder)) body: AdvanceOrder,
  ) {
    return this.orders.advance(user, id, body);
  }
}
