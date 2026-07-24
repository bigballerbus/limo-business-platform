import { inngest } from '../client';
import { alertOwner, loadEnquiryContext } from '@/lib/crm/enquiry';
import { sendMessage } from '@/lib/messaging/send';

/**
 * The async half of the enquiry critical path (§2.4). Runs off enquiry/created
 * so the customer's response never waits on a third party. Each step is durable
 * and independently retried; if Twilio is slow the price has already rendered.
 */
export const enquiryCreated = inngest.createFunction(
  { id: 'enquiry-created', retries: 3 },
  { event: 'enquiry/created' },
  async ({ event, step }) => {
    const { enquiryId, tenantId } = event.data;

    const ctx = await step.run('load-enquiry', () => loadEnquiryContext(tenantId, enquiryId));
    if (!ctx) return { skipped: 'enquiry_not_found' };

    // Instant response to the customer (transactional — always sends).
    await step.run('instant-email', () =>
      sendMessage(tenantId, {
        customerId: ctx.customerId,
        channel: 'email',
        messageClass: 'transactional',
        templateKey: 'quote_instant_response',
      }),
    );
    await step.run('instant-sms', () =>
      sendMessage(tenantId, {
        customerId: ctx.customerId,
        channel: 'sms',
        messageClass: 'transactional',
        templateKey: 'quote_instant_response',
      }),
    );

    // Audible alert to the owning coordinator.
    await step.run('owner-alert', () => alertOwner(tenantId, enquiryId, ctx.ownerId));

    return { enquiryId, reference: ctx.reference };
  },
);
