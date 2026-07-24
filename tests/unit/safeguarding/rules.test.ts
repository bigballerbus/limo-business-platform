import { describe, expect, it } from 'vitest';
import {
  MAX_SINGLE_VEHICLE_PASSENGERS,
  canTakeDeposit,
  capacityDecision,
  requiresGuardianVerification,
} from '@/lib/domain/safeguarding/rules';

/**
 * BC1 (≤8 single-vehicle) and BC2 (under-18 guardian gate) — pure rules.
 * These mirror the database CHECK and the enquiry critical-path branch, so
 * they are pinned here to catch drift in either direction.
 */
describe('capacityDecision (BC1)', () => {
  it('keeps the licensed capacity at 8', () => {
    expect(MAX_SINGLE_VEHICLE_PASSENGERS).toBe(8);
  });

  it('routes a party at or under capacity to a single vehicle', () => {
    expect(capacityDecision(1)).toBe('single_vehicle');
    expect(capacityDecision(8)).toBe('single_vehicle');
  });

  it('routes a party over capacity to a multi-vehicle arrangement', () => {
    expect(capacityDecision(9)).toBe('multi_vehicle');
    expect(capacityDecision(16)).toBe('multi_vehicle');
  });
});

describe('guardian rules (BC2)', () => {
  it('requires guardian verification whenever minors travel', () => {
    expect(requiresGuardianVerification(true)).toBe(true);
    expect(requiresGuardianVerification(false)).toBe(false);
  });

  it('allows a deposit for a booking without minors', () => {
    expect(canTakeDeposit({ underEighteen: false, guardianVerified: false })).toBe(true);
  });

  it('blocks a deposit for a minor booking until the guardian is verified', () => {
    expect(canTakeDeposit({ underEighteen: true, guardianVerified: false })).toBe(false);
    expect(canTakeDeposit({ underEighteen: true, guardianVerified: true })).toBe(true);
  });
});
