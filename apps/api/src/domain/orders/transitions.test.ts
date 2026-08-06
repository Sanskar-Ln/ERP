import { describe, expect, it } from 'vitest';
import { OrderStatus as O, PurchaseOrderStatus as P } from '@erp/shared';
import {
  assertOrderTransition,
  assertPurchaseOrderTransition,
  canAdvanceOrder,
  TransitionError,
} from './transitions';

describe('customer-order transitions', () => {
  it('walks the happy path end to end', () => {
    const path: O[] = [O.DRAFT, O.CONFIRMED, O.PROCESSING, O.READY, O.DELIVERED, O.COMPLETED];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => assertOrderTransition(path[i]!, path[i + 1]!)).not.toThrow();
    }
  });

  it('allows CANCELLED from every pre-delivery state only', () => {
    for (const from of [O.DRAFT, O.CONFIRMED, O.PROCESSING, O.READY]) {
      expect(canAdvanceOrder(from, O.CANCELLED)).toBe(true);
    }
    for (const from of [O.DELIVERED, O.COMPLETED, O.CANCELLED]) {
      expect(canAdvanceOrder(from, O.CANCELLED)).toBe(false);
    }
  });

  it('rejects skipping stages and going backwards', () => {
    expect(() => assertOrderTransition(O.DRAFT, O.READY)).toThrow(TransitionError);
    expect(() => assertOrderTransition(O.CONFIRMED, O.DELIVERED)).toThrow(TransitionError);
    expect(() => assertOrderTransition(O.READY, O.CONFIRMED)).toThrow(TransitionError);
    expect(() => assertOrderTransition(O.COMPLETED, O.DRAFT)).toThrow(TransitionError);
  });
});

describe('purchase-order transitions', () => {
  it('DRAFT→ORDERED→RECEIVED is the only forward path', () => {
    expect(() => assertPurchaseOrderTransition(P.DRAFT, P.ORDERED)).not.toThrow();
    expect(() => assertPurchaseOrderTransition(P.ORDERED, P.RECEIVED)).not.toThrow();
    expect(() => assertPurchaseOrderTransition(P.DRAFT, P.RECEIVED)).toThrow(TransitionError);
  });

  it('cancellable until receipt; RECEIVED is terminal', () => {
    expect(() => assertPurchaseOrderTransition(P.DRAFT, P.CANCELLED)).not.toThrow();
    expect(() => assertPurchaseOrderTransition(P.ORDERED, P.CANCELLED)).not.toThrow();
    expect(() => assertPurchaseOrderTransition(P.RECEIVED, P.CANCELLED)).toThrow(TransitionError);
    expect(() => assertPurchaseOrderTransition(P.RECEIVED, P.ORDERED)).toThrow(TransitionError);
  });
});
