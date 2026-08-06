/**
 * Order & purchase-order lifecycle transitions — PURE domain logic.
 *
 * Both pipelines are one-way state machines; every legal edge is listed
 * explicitly. Anything not listed is rejected — services translate the
 * thrown TransitionError into a 400.
 *
 * BUSINESS RULES ENCODED:
 * - Customer orders: DRAFT→CONFIRMED→PROCESSING→READY→DELIVERED→COMPLETED.
 *   CANCELLED is reachable from any state BEFORE delivery — once goods have
 *   left with the customer the remedy is billing-side (cancel the invoice),
 *   not order-side.
 * - Purchase orders: DRAFT→ORDERED→RECEIVED, cancellable until receipt.
 *   RECEIVED is terminal — received goods are corrected via inventory
 *   adjustments, never by rewinding the PO.
 */
import { OrderStatus, PurchaseOrderStatus } from '@erp/shared';

export class TransitionError extends Error {
  constructor(kind: string, from: string, to: string) {
    super(`${kind} cannot go ${from} → ${to}`);
    this.name = 'TransitionError';
  }
}

const ORDER_EDGES: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  PROCESSING: [OrderStatus.READY, OrderStatus.CANCELLED],
  READY: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  DELIVERED: [OrderStatus.COMPLETED],
  COMPLETED: [],
  CANCELLED: [],
};

const PO_EDGES: Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]> = {
  DRAFT: [PurchaseOrderStatus.ORDERED, PurchaseOrderStatus.CANCELLED],
  ORDERED: [PurchaseOrderStatus.RECEIVED, PurchaseOrderStatus.CANCELLED],
  RECEIVED: [],
  CANCELLED: [],
};

/** True when the customer-order edge is legal. */
export const canAdvanceOrder = (from: OrderStatus, to: OrderStatus): boolean =>
  (ORDER_EDGES[from] ?? []).includes(to);

/** Throw unless the customer-order edge is legal. */
export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canAdvanceOrder(from, to)) throw new TransitionError('order', from, to);
}

/** True when the purchase-order edge is legal. */
export const canAdvancePurchaseOrder = (from: PurchaseOrderStatus, to: PurchaseOrderStatus): boolean =>
  (PO_EDGES[from] ?? []).includes(to);

/** Throw unless the purchase-order edge is legal. */
export function assertPurchaseOrderTransition(from: PurchaseOrderStatus, to: PurchaseOrderStatus): void {
  if (!canAdvancePurchaseOrder(from, to)) throw new TransitionError('purchase order', from, to);
}
