/**
 * Journey-variant nurture cadences (spec §10, OI-11) — pure logic.
 *
 * A lead that does not convert enters a variant-specific nurture ladder: a
 * sequence of marketing touches at increasing day offsets. Weddings nurture over
 * a long horizon (decisions are made months out); transfers and corporate are
 * short and practical. Every touch is marketing-class, so the BC6 send gate still
 * governs whether it actually goes out.
 *
 * ⚠️ PLACEHOLDER cadences (OI-11): the offsets and templates are documented,
 * production-shaped defaults for the client to approve. Swapping them is data,
 * not code. The engine is pure and deterministic — `now`/entry are passed in.
 */

export type JourneyVariant = 'wedding' | 'prom' | 'transfer' | 'celebration' | 'corporate';

export interface NurtureTouch {
  /** Days after entering nurture that this touch is due. */
  dayOffset: number;
  channel: 'email' | 'sms';
  templateKey: string;
}

const CADENCES: Record<JourneyVariant, NurtureTouch[]> = {
  wedding: [
    { dayOffset: 3, channel: 'email', templateKey: 'wedding_nurture_inspiration' },
    { dayOffset: 21, channel: 'email', templateKey: 'wedding_nurture_showcase' },
    { dayOffset: 60, channel: 'email', templateKey: 'wedding_nurture_availability' },
    { dayOffset: 120, channel: 'email', templateKey: 'wedding_nurture_final' },
  ],
  prom: [
    { dayOffset: 2, channel: 'sms', templateKey: 'prom_nurture_reminder' },
    { dayOffset: 14, channel: 'email', templateKey: 'prom_nurture_group' },
  ],
  celebration: [
    { dayOffset: 3, channel: 'email', templateKey: 'celebration_nurture_ideas' },
    { dayOffset: 30, channel: 'email', templateKey: 'celebration_nurture_offer' },
  ],
  corporate: [
    { dayOffset: 5, channel: 'email', templateKey: 'corporate_nurture_account' },
    { dayOffset: 45, channel: 'email', templateKey: 'corporate_nurture_checkin' },
  ],
  transfer: [{ dayOffset: 7, channel: 'email', templateKey: 'transfer_nurture_next_trip' }],
};

export function nurtureCadence(variant: JourneyVariant): NurtureTouch[] {
  return CADENCES[variant];
}

/**
 * Touches that are due now (offset elapsed since entry) but not yet sent. `sent`
 * is the count already dispatched, so the ladder resumes exactly where it left
 * off across a durable workflow's replays.
 */
export function dueNurtureTouches(
  variant: JourneyVariant,
  enteredAt: Date,
  sent: number,
  now: Date,
): NurtureTouch[] {
  const elapsedDays = (now.getTime() - enteredAt.getTime()) / 86_400_000;
  return nurtureCadence(variant)
    .slice(sent)
    .filter((touch) => touch.dayOffset <= elapsedDays);
}
