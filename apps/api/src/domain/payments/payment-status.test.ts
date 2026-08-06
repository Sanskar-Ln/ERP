import { describe, expect, it } from 'vitest';
import { DocStatus, PaymentKind, PaymentStatus } from '@erp/shared';
import { assertPaymentAllowed, PaymentRuleError, summarizePayments } from './payment-status';

const pay = (amountPaise: number) => ({ kind: PaymentKind.PAYMENT, amountPaise });
const refund = (amountPaise: number) => ({ kind: PaymentKind.REFUND, amountPaise });

describe('summarizePayments', () => {
  it('no rows → UNPAID with full due', () => {
    const s = summarizePayments(100_000, []);
    expect(s).toEqual({ paidPaise: 0, refundedPaise: 0, netPaidPaise: 0, duePaise: 100_000, status: PaymentStatus.UNPAID });
  });

  it('partial payment → PARTIALLY_PAID with remaining due', () => {
    const s = summarizePayments(100_000, [pay(40_000)]);
    expect(s.status).toBe(PaymentStatus.PARTIALLY_PAID);
    expect(s.duePaise).toBe(60_000);
  });

  it('payments summing to the total → PAID, zero due', () => {
    const s = summarizePayments(100_000, [pay(40_000), pay(60_000)]);
    expect(s.status).toBe(PaymentStatus.PAID);
    expect(s.duePaise).toBe(0);
  });

  it('full refund of everything paid → REFUNDED', () => {
    const s = summarizePayments(100_000, [pay(100_000), refund(100_000)]);
    expect(s.status).toBe(PaymentStatus.REFUNDED);
    expect(s.netPaidPaise).toBe(0);
  });

  it('partial refund keeps PARTIALLY_PAID and reopens the due', () => {
    const s = summarizePayments(100_000, [pay(100_000), refund(30_000)]);
    expect(s.status).toBe(PaymentStatus.PARTIALLY_PAID);
    expect(s.duePaise).toBe(30_000);
  });

  it('rejects non-positive amounts and bad totals', () => {
    expect(() => summarizePayments(100, [pay(0)])).toThrow(RangeError);
    expect(() => summarizePayments(-1, [])).toThrow(RangeError);
    expect(() => summarizePayments(100, [pay(1.5)])).toThrow(RangeError);
  });
});

describe('assertPaymentAllowed', () => {
  const summary = (grand: number, rows: { kind: PaymentKind; amountPaise: number }[]) =>
    summarizePayments(grand, rows);

  it('allows a payment up to the due, rejects overpayment', () => {
    const s = summary(100_000, [pay(40_000)]);
    expect(() => assertPaymentAllowed(DocStatus.ISSUED, PaymentKind.PAYMENT, 60_000, s)).not.toThrow();
    expect(() => assertPaymentAllowed(DocStatus.ISSUED, PaymentKind.PAYMENT, 60_001, s)).toThrow(PaymentRuleError);
  });

  it('rejects payments on cancelled documents but allows refunds there', () => {
    const s = summary(100_000, [pay(100_000)]);
    expect(() => assertPaymentAllowed(DocStatus.CANCELLED, PaymentKind.PAYMENT, 1, s)).toThrow(PaymentRuleError);
    expect(() => assertPaymentAllowed(DocStatus.CANCELLED, PaymentKind.REFUND, 100_000, s)).not.toThrow();
  });

  it('rejects refunding more than net paid', () => {
    const s = summary(100_000, [pay(50_000), refund(20_000)]);
    expect(() => assertPaymentAllowed(DocStatus.ISSUED, PaymentKind.REFUND, 30_000, s)).not.toThrow();
    expect(() => assertPaymentAllowed(DocStatus.ISSUED, PaymentKind.REFUND, 30_001, s)).toThrow(PaymentRuleError);
  });
});
