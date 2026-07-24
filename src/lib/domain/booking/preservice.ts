/**
 * Pre-service communication schedule (spec §5.6) — pure logic.
 *
 * A confirmed booking triggers a fixed ladder of transactional touches ahead of
 * pickup: the balance reminder (−7 days), the itinerary (−48 hours), the
 * chauffeur disclosure with photo (−24 hours), and the en-route dispatch
 * (−2 hours). This function turns a pickup time into concrete send times and
 * drops any milestone whose moment has already passed — a booking made three
 * days out simply skips the −7-day reminder (the balance is chased immediately
 * by other means) rather than firing it in the past.
 *
 * It is pure and deterministic: `now` is passed in, never read, so the durable
 * workflow can compute the schedule inside a replayable step.
 */

export type PreServiceStep = 'balance_reminder' | 'itinerary' | 'chauffeur_disclosure' | 'en_route';

/** Minutes before pickup each milestone fires. */
export const PRE_SERVICE_OFFSETS_MINUTES: Record<PreServiceStep, number> = {
  balance_reminder: 7 * 24 * 60,
  itinerary: 48 * 60,
  chauffeur_disclosure: 24 * 60,
  en_route: 2 * 60,
};

/** The channel + template each milestone uses (all transactional — BC6). */
export const PRE_SERVICE_TEMPLATES: Record<
  PreServiceStep,
  { channel: 'email' | 'sms'; templateKey: string }
> = {
  balance_reminder: { channel: 'email', templateKey: 'balance_reminder' },
  itinerary: { channel: 'email', templateKey: 'booking_itinerary' },
  chauffeur_disclosure: { channel: 'sms', templateKey: 'chauffeur_disclosure' },
  en_route: { channel: 'sms', templateKey: 'chauffeur_en_route' },
};

export interface PreServiceMilestone {
  step: PreServiceStep;
  sendAt: Date;
}

const ORDER: PreServiceStep[] = [
  'balance_reminder',
  'itinerary',
  'chauffeur_disclosure',
  'en_route',
];

export function preServiceSchedule(pickupAt: Date, now: Date): PreServiceMilestone[] {
  return ORDER.map((step) => ({
    step,
    sendAt: new Date(pickupAt.getTime() - PRE_SERVICE_OFFSETS_MINUTES[step] * 60_000),
  })).filter((m) => m.sendAt.getTime() > now.getTime());
}
