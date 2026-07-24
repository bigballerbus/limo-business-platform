import { inngest } from '../client';
import { getDefaultTenant } from '@/lib/tenant/resolve';
import { findNeedsAttention, sweepOrphans } from '@/lib/crm/attentionSweep';

/**
 * The never-forgotten-lead sweep (spec §13, BC9). Runs hourly: re-drives any
 * open lead whose next action has slipped past due so it re-surfaces for the
 * owner, then reports how much still needs attention. The dashboard target is an
 * empty queue by 18:00; this keeps it converging toward that. Multi-tenant
 * deployments iterate tenants here.
 */
export const attentionSweep = inngest.createFunction(
  { id: 'attention-sweep' },
  { cron: '0 * * * *' },
  async ({ step }) => {
    const tenant = await step.run('resolve-tenant', () => getDefaultTenant());
    const swept = await step.run('sweep-orphans', () => sweepOrphans(tenant.id));
    const outstanding = await step.run(
      'count-outstanding',
      async () => (await findNeedsAttention(tenant.id)).length,
    );
    return { reDriven: swept.reDriven, outstanding };
  },
);
