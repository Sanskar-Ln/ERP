/**
 * Payment settlement — PURE domain logic (no NestJS/Prisma).
 *
 * The payment ledger is APPEND-ONLY: rows are PAYMENT or REFUND, both with
 * positive amounts; a wrong payment is corrected by a refund row, never by
 * editing. Settlement status is always DERIVED from the rows against the
 * document's grand total — it is never stored, so it can never drift.
 */
import { DocStatus, PaymentKind, PaymentStatus, type Paise } from '@erp/shared';

/** One ledger row as the summariser needs it. */
export interface PaymentRowInput {
  kind: PaymentKind;
  /** always positive; kind carries the direction */
  amountPaise: Paise;
}

export interface PaymentSummary {
  paidPaise: Paise;
  refundedPaise: Paise;
  /** paid − refunded (what the shop is actually holding) */
  netPaidPaise: Paise;
  /** grand total − net paid, floored at 0 */
  duePaise: Paise;
  status: PaymentStatus;
}

/** Derive the settlement summary of a document from its payment rows. */
export function summarizePayments(grandTotalPaise: Paise, rows: readonly PaymentRowInput[]): PaymentSummary {
  if (!Number.isSafeInteger(grandTotalPaise) || grandTotalPaise < 0) {
    throw new RangeError(`invalid grand total ${grandTotalPaise}`);
  }
  let paid = 0;
  let refunded = 0;
  for (const r of rows) {
    if (!Number.isSafeInteger(r.amountPaise) || r.amountPaise <= 0) {
      throw new RangeError(`payment amounts must be positive integers, got ${r.amountPaise}`);
    }
    if (r.kind === PaymentKind.REFUND) refunded += r.amountPaise;
    else paid += r.amountPaise;
  }
  const netPaid = paid - refunded;
  const due = Math.max(0, grandTotalPaise - netPaid);

  let status: PaymentStatus;
  if (paid === 0) status = PaymentStatus.UNPAID;
  else if (netPaid <= 0) status = PaymentStatus.REFUNDED; // everything returned
  else if (due === 0) status = PaymentStatus.PAID;
  else status = PaymentStatus.PARTIALLY_PAID;

  return { paidPaise: paid, refundedPaise: refunded, netPaidPaise: netPaid, duePaise: due, status };
}

/** Thrown when a payment/refund would break the ledger's invariants. */
export class PaymentRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentRuleError';
  }
}

/**
 * Guard a new ledger row BEFORE it is written.
 * BUSINESS RULES:
 * - amounts are positive integers;
 * - a PAYMENT may not exceed what is still due (no overpayment — an advance
 *   beyond the bill is a bookkeeping smell, not a feature);
 * - a PAYMENT cannot be taken against a CANCELLED/SUPERSEDED document;
 * - a REFUND may not exceed what was net-paid (you cannot return money you
 *   never took), but IS allowed on cancelled documents — that is exactly
 *   when money goes back.
 */
export function assertPaymentAllowed(
  docStatus: DocStatus,
  kind: PaymentKind,
  amountPaise: Paise,
  current: PaymentSummary,
): void {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new PaymentRuleError('amount must be a positive integer (paise)');
  }
  if (kind === PaymentKind.PAYMENT) {
    if (docStatus === DocStatus.CANCELLED || docStatus === DocStatus.SUPERSEDED) {
      throw new PaymentRuleError(`cannot take a payment against a ${docStatus} document`);
    }
    if (amountPaise > current.duePaise) {
      throw new PaymentRuleError(
        `payment ₹${(amountPaise / 100).toFixed(2)} exceeds the due ₹${(current.duePaise / 100).toFixed(2)}`,
      );
    }
  } else {
    if (amountPaise > current.netPaidPaise) {
      throw new PaymentRuleError(
        `refund ₹${(amountPaise / 100).toFixed(2)} exceeds the net paid ₹${(current.netPaidPaise / 100).toFixed(2)}`,
      );
    }
  }
}
