/**
 * Deposit and balance policy (spec §5) — pure logic.
 *
 * The real deposit percentage, minimum, and balance lead time are a client
 * decision still open (OI-6). Until they are confirmed the flow is built and
 * tested against a documented, clearly-labelled placeholder, exactly as the
 * pricing engine is built against the placeholder rate card (D-004). Swapping
 * in the real figures is configuration, not code.
 *
 * Money is always integer pence (§3.1); VAT is zero for Kent Limousines
 * (D-002), so gross equals net and the deposit is taken on the full price.
 */
import type { Pence } from '@/lib/domain/pricing/money';

export interface DepositPolicy {
  /** Fraction of the total taken as a deposit, 0..1. */
  percent: number;
  /** Never take less than this, so tiny jobs still commit the customer. */
  minimumPence: Pence;
  /** Balance falls due this many days before the pickup. */
  balanceDueDaysBeforePickup: number;
}

/** PLACEHOLDER — replace with the client's confirmed terms before go-live (OI-6). */
export const PLACEHOLDER_DEPOSIT_POLICY: DepositPolicy = {
  percent: 0.2,
  minimumPence: 5000,
  balanceDueDaysBeforePickup: 14,
};

export interface DepositSplit {
  depositPence: Pence;
  balancePence: Pence;
}

/**
 * Split a total into a deposit and the remaining balance. The deposit is the
 * greater of the percentage and the minimum, but never more than the total
 * (a job smaller than the minimum is simply paid in full up front).
 */
export function splitDeposit(totalPence: Pence, policy: DepositPolicy): DepositSplit {
  assertInteger(totalPence, 'totalPence');
  if (totalPence <= 0) throw new RangeError('Cannot take a deposit on a non-positive total');
  const byPercent = Math.round(totalPence * policy.percent);
  const depositPence = Math.min(Math.max(byPercent, policy.minimumPence), totalPence);
  return { depositPence, balancePence: totalPence - depositPence };
}

/**
 * The date the balance must be paid, `daysBefore` days ahead of pickup.
 * Returned as a UTC date-only value; the caller stores it in a `date` column.
 */
export function balanceDueDate(pickupAt: Date, daysBefore: number): Date {
  const due = new Date(pickupAt.getTime());
  due.setUTCDate(due.getUTCDate() - daysBefore);
  due.setUTCHours(0, 0, 0, 0);
  return due;
}

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be integer pence, received ${value}`);
  }
}
