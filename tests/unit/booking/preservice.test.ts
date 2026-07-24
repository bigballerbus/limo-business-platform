import { describe, expect, it } from 'vitest';
import { PRE_SERVICE_OFFSETS_MINUTES, preServiceSchedule } from '@/lib/domain/booking/preservice';

const HOUR = 60 * 60 * 1000;
const pickupAt = new Date('2030-06-15T12:00:00Z');

describe('preServiceSchedule', () => {
  it('schedules all four milestones for a booking made well ahead', () => {
    const now = new Date('2030-06-01T00:00:00Z'); // 14 days out
    const schedule = preServiceSchedule(pickupAt, now);
    expect(schedule.map((m) => m.step)).toEqual([
      'balance_reminder',
      'itinerary',
      'chauffeur_disclosure',
      'en_route',
    ]);
  });

  it('places each milestone the right distance before pickup', () => {
    const now = new Date('2030-06-01T00:00:00Z');
    const byStep = Object.fromEntries(
      preServiceSchedule(pickupAt, now).map((m) => [m.step, m.sendAt.getTime()]),
    );
    expect(pickupAt.getTime() - byStep.balance_reminder).toBe(
      PRE_SERVICE_OFFSETS_MINUTES.balance_reminder * 60_000,
    );
    expect(pickupAt.getTime() - byStep.en_route).toBe(2 * HOUR);
  });

  it('drops milestones already in the past for a late booking', () => {
    const now = new Date('2030-06-14T18:00:00Z'); // 18 hours out
    const steps = preServiceSchedule(pickupAt, now).map((m) => m.step);
    // −7d, −48h and −24h have all passed; only the −2h en-route remains.
    expect(steps).toEqual(['en_route']);
  });

  it('returns nothing when pickup is imminent', () => {
    const now = new Date('2030-06-15T11:30:00Z'); // 30 minutes out
    expect(preServiceSchedule(pickupAt, now)).toEqual([]);
  });
});
