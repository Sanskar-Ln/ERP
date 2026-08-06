/**
 * Purchase orders — procurement intake.
 *
 * Flow: Supplier → PO (DRAFT) → ORDERED → receive (weight verification) →
 * a Lot is created for intake → RECEIVED. Items are then created against
 * the lot through the normal inventory intake (item creation posts the
 * PURCHASE_IN ledger row), so stock NEVER appears without its ledger entry.
 *
 * Money to the supplier is tracked as append-only SupplierPayment rows;
 * the outstanding amount is derived (total − paid), never stored.
 *
 * RBAC: procurement is ADMIN-only end to end (setup/back-office work).
 */
import { BadRequestException, Body, Controller, Get, Injectable, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  newId,
  PurchaseOrderStatus,
  Role,
  zCreatePurchaseOrder,
  zId,
  zReceivePurchaseOrder,
  zSupplierPayment,
  type CreatePurchaseOrder,
  type JwtClaims,
  type ReceivePurchaseOrder,
  type SupplierPaymentInput,
} from '@erp/shared';
import { CurrentUser, Roles } from '../../platform/auth/auth.decorators';
import { TenancyService } from '../../platform/tenancy/tenancy.service';
import { AuditService } from '../../platform/audit/audit.service';
import { ZodPipe } from '../../platform/validation/zod.pipe';
import { ApiZodBody } from '../../platform/validation/openapi';
import { assertPurchaseOrderTransition, TransitionError } from '../../domain/orders/transitions';
import { nextSeriesNumber } from '../billing/number-series';

const zPoQuery = z.object({
  status: z.nativeEnum(PurchaseOrderStatus).optional(),
  supplierId: zId.optional(),
});

/** Derived supplier settlement: total vs paid. */
const settle = (totalValuePaise: bigint, payments: { amountPaise: bigint }[]) => {
  const paid = payments.reduce((s, p) => s + Number(p.amountPaise), 0);
  const due = Math.max(0, Number(totalValuePaise) - paid);
  return { paidPaise: paid, duePaise: due, settled: due === 0 };
};

@Injectable()
export class PurchasesService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly audit: AuditService,
  ) {}

  async create(user: JwtClaims, input: CreatePurchaseOrder) {
    const db = this.tenancy.client(user.tenantId);
    const now = new Date();
    return db.$transaction(async (tx) => {
      await tx.supplier.findUniqueOrThrow({ where: { id: input.supplierId } });
      const total = input.lines.reduce((s, l) => s + l.valuePaise, 0);
      const poNumber = await nextSeriesNumber(tx, user.tenantId, 'PO', now);
      const po = await tx.purchaseOrder.create({
        data: {
          id: newId(),
          tenantId: user.tenantId,
          poNumber,
          supplierId: input.supplierId,
          branchId: input.branchId,
          expectedAt: input.expectedAt ? new Date(input.expectedAt) : null,
          note: input.note ?? null,
          totalValuePaise: BigInt(total),
          createdByUserId: user.sub,
          lines: {
            create: input.lines.map((l, i) => ({
              id: newId(),
              tenantId: user.tenantId,
              lineNo: i + 1,
              description: l.description,
              category: l.category ?? null,
              pieces: l.pieces,
              expectedWeightG: l.expectedWeightG ?? null,
              purityId: l.purityId ?? null,
              ratePaisePer10g: l.ratePaisePer10g != null ? BigInt(l.ratePaisePer10g) : null,
              valuePaise: BigInt(l.valuePaise),
            })),
          },
        },
        include: { lines: true },
      });
      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'PurchaseOrder',
        entityId: po.id,
        action: 'CREATE',
        after: { poNumber, supplierId: input.supplierId, totalValuePaise: total },
      });
      return po;
    });
  }

  /** DRAFT→ORDERED or (pre-receipt) →CANCELLED. */
  async advance(user: JwtClaims, id: string, to: PurchaseOrderStatus) {
    const db = this.tenancy.client(user.tenantId);
    return db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id } });
      try {
        assertPurchaseOrderTransition(po.status as PurchaseOrderStatus, to);
      } catch (err) {
        if (err instanceof TransitionError) throw new BadRequestException(err.message);
        throw err;
      }
      if (to === PurchaseOrderStatus.RECEIVED) {
        throw new BadRequestException('use POST /purchase-orders/:id/receive for goods receipt');
      }
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: { status: to, ...(to === PurchaseOrderStatus.ORDERED ? { orderedAt: new Date() } : {}) },
      });
      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'PurchaseOrder',
        entityId: id,
        action: to,
        before: { status: po.status },
        after: { status: to },
      });
      return updated;
    });
  }

  /**
   * Goods receipt: verify weights per line, create the intake Lot, flip to
   * RECEIVED — one transaction. Items are created against the lot afterwards
   * via the normal item intake (which posts PURCHASE_IN).
   */
  async receive(user: JwtClaims, id: string, input: ReceivePurchaseOrder) {
    const db = this.tenancy.client(user.tenantId);
    const now = new Date();
    return db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { lines: true } });
      try {
        assertPurchaseOrderTransition(po.status as PurchaseOrderStatus, PurchaseOrderStatus.RECEIVED);
      } catch (err) {
        if (err instanceof TransitionError) throw new BadRequestException(err.message);
        throw err;
      }

      // weight verification per line (optional but validated when given)
      for (const rec of input.lines) {
        const line = po.lines.find((l) => l.lineNo === rec.lineNo);
        if (!line) throw new BadRequestException(`no PO line ${rec.lineNo}`);
        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { receivedWeightG: rec.receivedWeightG },
        });
      }

      const lot = await tx.lot.create({
        data: {
          id: newId(),
          tenantId: user.tenantId,
          lotNo: input.lotNo ?? po.poNumber,
          supplierId: po.supplierId,
          purchaseOrderId: po.id,
          receivedAt: now,
          note: input.note ?? `goods receipt of ${po.poNumber}`,
        },
      });

      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: { status: PurchaseOrderStatus.RECEIVED, receivedAt: now },
        include: { lines: true },
      });

      await this.audit.log(tx, {
        actorUserId: user.sub,
        entity: 'PurchaseOrder',
        entityId: id,
        action: 'RECEIVE',
        before: { status: po.status },
        after: { status: PurchaseOrderStatus.RECEIVED, lotId: lot.id, lotNo: lot.lotNo },
      });

      return { ...updated, lot };
    });
  }

  /** Append-only money-out row against the PO. */
  async pay(user: JwtClaims, id: string, input: SupplierPaymentInput) {
    const db = this.tenancy.client(user.tenantId);
    return db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { supplierPayments: true } });
      if (po.status === PurchaseOrderStatus.CANCELLED) {
        throw new BadRequestException('cannot pay a cancelled purchase order');
      }
      const { duePaise } = settle(po.totalValuePaise, po.supplierPayments);
      if (input.amountPaise > duePaise) {
        throw new BadRequestException(
          `payment ₹${(input.amountPaise / 100).toFixed(2)} exceeds the outstanding ₹${(duePaise / 100).toFixed(2)}`,
        );
      }
      const payment = await tx.supplierPayment.create({
        data: {
          id: newId(),
          tenantId: user.tenantId,
          purchaseOrderId: id,
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
        entity: 'SupplierPayment',
        entityId: payment.id,
        action: 'RECORD',
        after: { purchaseOrderId: id, poNumber: po.poNumber, amountPaise: input.amountPaise, mode: input.mode },
      });
      return {
        payment,
        settlement: settle(po.totalValuePaise, [...po.supplierPayments, payment]),
      };
    });
  }
}

@ApiTags('purchases')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchasesController {
  constructor(
    private readonly purchases: PurchasesService,
    private readonly tenancy: TenancyService,
  ) {}

  @Post()
  @Roles(Role.ADMIN)
  @ApiZodBody(zCreatePurchaseOrder)
  create(@CurrentUser() user: JwtClaims, @Body(new ZodPipe(zCreatePurchaseOrder)) body: CreatePurchaseOrder) {
    return this.purchases.create(user, body);
  }

  @Get()
  @Roles(Role.ADMIN)
  async list(@CurrentUser() user: JwtClaims, @Query(new ZodPipe(zPoQuery)) q: z.infer<typeof zPoQuery>) {
    const pos = await this.tenancy.client(user.tenantId).purchaseOrder.findMany({
      where: { status: q.status, supplierId: q.supplierId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { supplierPayments: { select: { amountPaise: true } } },
    });
    return pos.map(({ supplierPayments, ...po }) => ({
      ...po,
      settlement: settle(po.totalValuePaise, supplierPayments),
    }));
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  async get(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    const po = await this.tenancy.client(user.tenantId).purchaseOrder.findUniqueOrThrow({
      where: { id },
      include: { lines: { orderBy: { lineNo: 'asc' } }, supplierPayments: { orderBy: { paidAt: 'asc' } } },
    });
    return { ...po, settlement: settle(po.totalValuePaise, po.supplierPayments) };
  }

  @Post(':id/order')
  @Roles(Role.ADMIN)
  markOrdered(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    return this.purchases.advance(user, id, PurchaseOrderStatus.ORDERED);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN)
  cancel(@CurrentUser() user: JwtClaims, @Param('id', new ZodPipe(zId)) id: string) {
    return this.purchases.advance(user, id, PurchaseOrderStatus.CANCELLED);
  }

  @Post(':id/receive')
  @Roles(Role.ADMIN)
  @ApiZodBody(zReceivePurchaseOrder)
  receive(
    @CurrentUser() user: JwtClaims,
    @Param('id', new ZodPipe(zId)) id: string,
    @Body(new ZodPipe(zReceivePurchaseOrder)) body: ReceivePurchaseOrder,
  ) {
    return this.purchases.receive(user, id, body);
  }

  @Post(':id/payments')
  @Roles(Role.ADMIN)
  @ApiZodBody(zSupplierPayment)
  pay(
    @CurrentUser() user: JwtClaims,
    @Param('id', new ZodPipe(zId)) id: string,
    @Body(new ZodPipe(zSupplierPayment)) body: SupplierPaymentInput,
  ) {
    return this.purchases.pay(user, id, body);
  }
}
