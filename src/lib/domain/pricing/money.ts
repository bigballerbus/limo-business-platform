/**
 * Money is always integer pence — never floating point (spec §3.1).
 *
 * These helpers are pure and framework-free. The VAT breakdown is modelled
 * even though Kent Limousines charges no VAT (decision D-002): the rate
 * defaults to 0, so `net === gross` today, but the shape means a future VAT
 * change is a configuration change, not a schema or code change.
 */

export type Pence = number;

/** Multiply a pence amount by a decimal multiplier and round to whole pence. */
export function applyMultiplier(amount: Pence, multiplier: number): Pence {
  assertInteger(amount, 'amount');
  return Math.round(amount * multiplier);
}

/** Sum a list of pence amounts. */
export function sumPence(amounts: readonly Pence[]): Pence {
  return amounts.reduce((total, n) => {
    assertInteger(n, 'amount');
    return total + n;
  }, 0);
}

/**
 * Contribution margin as a percentage of revenue.
 * Returns the margin used by the BC3 floor check: ((revenue − cost) / revenue).
 * Revenue must be positive; a zero-revenue quote has no defined margin.
 */
export function contributionMarginPct(revenue: Pence, cost: Pence): number {
  assertInteger(revenue, 'revenue');
  assertInteger(cost, 'cost');
  if (revenue <= 0) {
    throw new RangeError('Cannot compute margin on non-positive revenue');
  }
  return ((revenue - cost) / revenue) * 100;
}

export interface VatBreakdown {
  netPence: Pence;
  vatPence: Pence;
  grossPence: Pence;
  vatRatePct: number;
}

/**
 * Split a gross (customer-facing) amount into net + VAT.
 * With the default 0% rate (Kent Limousines), net equals gross and VAT is zero.
 */
export function vatBreakdownFromGross(grossPence: Pence, vatRatePct = 0): VatBreakdown {
  assertInteger(grossPence, 'grossPence');
  if (vatRatePct < 0) throw new RangeError('VAT rate cannot be negative');
  const netPence = Math.round(grossPence / (1 + vatRatePct / 100));
  return {
    netPence,
    vatPence: grossPence - netPence,
    grossPence,
    vatRatePct,
  };
}

/** Format pence as a GBP string, e.g. 74400 → "£744.00". */
export function formatGBP(amount: Pence): string {
  assertInteger(amount, 'amount');
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount / 100);
}

function assertInteger(value: number, label: string): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be integer pence, received ${value}`);
  }
}
