import { inngest } from '../client';
import { escalate, findSlaBreaches } from '@/lib/crm/slaSweep';

/**
 * Scheduled SLA enforcement (§10.1). Runs every 5 minutes; each breach is
 * escalated in its own durable step so a single failure never blocks the rest.
 */
export const slaEnforcement = inngest.createFunction(
  { id: 'sla-enforcement' },
  { cron: '*/5 * * * *' },
  async ({ step }) => {
    const breaches = await step.run('find-breaches', () => findSlaBreaches());
    for (const breach of breaches) {
      await step.run(`escalate-${breach.enquiryId}`, () => escalate(breach));
    }
    return { escalated: breaches.length };
  },
);
