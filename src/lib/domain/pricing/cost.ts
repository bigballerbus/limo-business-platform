import type { CostModel } from './ratecard';

/**
 * Cost model — the operating reality behind a price (spec §8.2). Modelling cost,
 * not just price, is what lets the engine refuse an unprofitable quote (BC3).
 * Dead miles (empty running from base to pickup and destination back to base)
 * are the silent margin killer and are counted explicitly.
 */
export interface CostInput {
  liveMiles: number;
  deadMiles: number;
  hours: number;
  cost: CostModel;
}

export function estimateCost({ liveMiles, deadMiles, hours, cost }: CostInput): number {
  if (liveMiles < 0 || deadMiles < 0 || hours < 0) {
    throw new RangeError('Miles and hours must be non-negative');
  }
  const mileageCost = (liveMiles + deadMiles) * cost.perMilePence;
  const timeCost = hours * cost.perHourPence;
  return Math.round(mileageCost + timeCost + cost.fixedOverheadPence);
}
