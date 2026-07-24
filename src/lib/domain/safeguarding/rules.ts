/**
 * Safeguarding and capacity rules (BC1, BC2) — pure logic.
 *
 * BC1: vehicles are licensed for ≤8 passengers; 9+ is a different regulatory
 * class (PSV) and must never be single-vehicle quoted — it routes to a human for
 * a multi-vehicle arrangement.
 *
 * BC2: bookings carrying under-18s must be made and paid by a verified
 * parent/guardian; a deposit cannot be taken until that verification exists.
 */
export const MAX_SINGLE_VEHICLE_PASSENGERS = 8;

export type CapacityPath = 'single_vehicle' | 'multi_vehicle';

export function capacityDecision(passengerCount: number): CapacityPath {
  return passengerCount > MAX_SINGLE_VEHICLE_PASSENGERS ? 'multi_vehicle' : 'single_vehicle';
}

/** A guardian must be captured and verified whenever minors travel. */
export function requiresGuardianVerification(hasMinors: boolean): boolean {
  return hasMinors;
}

export interface DepositEligibility {
  underEighteen: boolean;
  guardianVerified: boolean;
}

/**
 * BC2 gate for taking a deposit. Bookings without minors proceed; bookings with
 * minors proceed only once a guardian is verified. Mirrors the database CHECK so
 * the rule is enforced both in the flow and at the data layer.
 */
export function canTakeDeposit(eligibility: DepositEligibility): boolean {
  if (!eligibility.underEighteen) return true;
  return eligibility.guardianVerified;
}
