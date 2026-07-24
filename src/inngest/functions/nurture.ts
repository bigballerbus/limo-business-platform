import { inngest } from '../client';
import { getDefaultTenant } from '@/lib/tenant/resolve';
import { loadNurtureContext, sendDueNurture } from '@/lib/crm/nurture';
import { nurtureCadence, type JourneyVariant } from '@/lib/domain/nurture/cadence';

/**
 * Durable nurture ladder (spec §10). Runs off enquiry/nurture.entered and sleeps
 * to each cadence touch for the lead's journey variant. Before every send it
 * re-checks that the lead is still cold — if it has converted or been re-driven
 * out of nurture, the workflow stops. Each sleep + send is a durable step, so a
 * deploy or redelivery resumes without re-sending earlier touches. Touches are
 * marketing-class, so the BC6 gate governs actual delivery.
 */
export const nurtureLadder = inngest.createFunction(
  { id: 'nurture-ladder', retries: 3 },
  { event: 'enquiry/nurture.entered' },
  async ({ event, step }) => {
    const { enquiryId, variant } = event.data;
    const tenant = await step.run('resolve-tenant', () => getDefaultTenant());

    const touches = nurtureCadence(variant as JourneyVariant);
    const enteredAt = await step.run('load-entry', async () => {
      const ctx = await loadNurtureContext(tenant.id, enquiryId);
      return ctx?.enteredAt ?? null;
    });
    if (!enteredAt) return { skipped: 'not_found' };

    let sent = 0;
    for (const [index, touch] of touches.entries()) {
      const sendAt = new Date(new Date(enteredAt).getTime() + touch.dayOffset * 86_400_000);
      await step.sleepUntil(`wait-touch-${index}`, sendAt);

      const cold = await step.run(`check-cold-${index}`, async () => {
        const ctx = await loadNurtureContext(tenant.id, enquiryId);
        return ctx?.stillNurturing ?? false;
      });
      if (!cold) return { enquiryId, sent, stopped: 'converted' };

      const dispatched = await step.run(`send-touch-${index}`, () =>
        sendDueNurture(tenant.id, enquiryId),
      );
      sent += dispatched;
    }

    return { enquiryId, sent };
  },
);
