import type { Zone } from './zones';

/**
 * BC3 — thrown when a computed quote would fall below the contribution-margin
 * floor. The customer never sees the margin maths (spec §8.3): the UI shows
 * "let us price this one properly" and routes to a human.
 */
export class BelowMarginFloorError extends Error {
  readonly totalPence: number;
  readonly costPence: number;
  readonly marginPct: number;
  readonly zone: Zone;

  constructor(details: { totalPence: number; costPence: number; marginPct: number; zone: Zone }) {
    super(
      `Quote rejected: margin ${details.marginPct.toFixed(1)}% is below the floor (zone ${details.zone}).`,
    );
    this.name = 'BelowMarginFloorError';
    this.totalPence = details.totalPence;
    this.costPence = details.costPence;
    this.marginPct = details.marginPct;
    this.zone = details.zone;
  }
}
