import { inngest } from '../client';
import { dispatchJourney, loadServiceContext } from '@/lib/crm/booking';
import { getDefaultTenant } from '@/lib/tenant/resolve';
import { sendMessage } from '@/lib/messaging/send';
import { PRE_SERVICE_TEMPLATES, preServiceSchedule } from '@/lib/domain/booking/preservice';

/**
 * The pre-service ladder (spec §5.6). Runs off booking/confirmed and sleeps
 * durably to each milestone: balance reminder (−7d), itinerary (−48h), chauffeur
 * disclosure with photo (−24h), and en-route dispatch (−2h). Every touch is
 * transactional (BC6 — always sends). The schedule is computed once inside a
 * replayable step; milestones already in the past (a late booking) are skipped.
 *
 * Each sleep + send is its own durable step, so a redelivery or a deploy resumes
 * exactly where it left off rather than re-sending earlier touches.
 */
export const preService = inngest.createFunction(
  { id: 'pre-service-sequence', retries: 3 },
  { event: 'booking/confirmed' },
  async ({ event, step }) => {
    const { bookingId } = event.data;

    const tenant = await step.run('resolve-tenant', () => getDefaultTenant());

    const ctx = await step.run('load-service-context', () =>
      loadServiceContext(tenant.id, bookingId),
    );
    if (!ctx) return { skipped: 'booking_not_found' };

    const schedule = await step.run('compute-schedule', () =>
      preServiceSchedule(new Date(ctx.pickupAt), new Date()).map((m) => ({
        step: m.step,
        sendAt: m.sendAt.toISOString(),
      })),
    );

    for (const milestone of schedule) {
      await step.sleepUntil(`wait-${milestone.step}`, new Date(milestone.sendAt));

      if (milestone.step === 'en_route') {
        await step.run('dispatch-journey', () => dispatchJourney(tenant.id, bookingId));
      }

      const template = PRE_SERVICE_TEMPLATES[milestone.step];
      await step.run(`send-${milestone.step}`, () =>
        sendMessage(tenant.id, {
          customerId: ctx.customerId,
          bookingId,
          channel: template.channel,
          messageClass: 'transactional',
          templateKey: template.templateKey,
        }),
      );
    }

    return { bookingId, milestones: schedule.map((m) => m.step) };
  },
);
