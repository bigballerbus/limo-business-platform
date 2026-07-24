/**
 * Reporting KPIs (spec §14) — pure logic.
 *
 * The funnel and its conversion rates are the business's core scorecard:
 * enquiry → quote → booking → completed, plus revenue and SLA compliance. The
 * calculators are pure so the in-app dashboard, the exported reporting view and
 * the tests all compute the same numbers.
 */

/** A rate as a percentage, 0 when the denominator is 0 (never NaN/Infinity). */
export function conversionRate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export interface FunnelCounts {
  enquiries: number;
  quoted: number;
  booked: number;
  completed: number;
}

export interface FunnelRates {
  /** Share of enquiries that received a quote. */
  quoteRate: number;
  /** Share of quoted enquiries that became bookings. */
  bookingRate: number;
  /** Share of bookings that completed the service. */
  completionRate: number;
  /** End-to-end: enquiries that became completed bookings. */
  enquiryToCompletion: number;
}

export function funnelRates(counts: FunnelCounts): FunnelRates {
  return {
    quoteRate: conversionRate(counts.quoted, counts.enquiries),
    bookingRate: conversionRate(counts.booked, counts.quoted),
    completionRate: conversionRate(counts.completed, counts.booked),
    enquiryToCompletion: conversionRate(counts.completed, counts.enquiries),
  };
}

export interface RevenueInput {
  bookedValuePence: number;
  completedValuePence: number;
  bookingCount: number;
}

export interface RevenueMetrics {
  bookedValuePence: number;
  completedValuePence: number;
  averageBookingValuePence: number;
}

export function revenueMetrics(input: RevenueInput): RevenueMetrics {
  return {
    bookedValuePence: input.bookedValuePence,
    completedValuePence: input.completedValuePence,
    averageBookingValuePence:
      input.bookingCount > 0 ? Math.round(input.bookedValuePence / input.bookingCount) : 0,
  };
}

/** SLA compliance: share of leads responded to within the standard. */
export function slaCompliance(withinSla: number, total: number): number {
  return conversionRate(withinSla, total);
}
