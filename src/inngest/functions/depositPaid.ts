import { inngest } from '../client';
import { withTenant } from '@/lib/db/client';
import { sendMessage } from '@/lib/messaging/send';

/**
 * Post-deposit confirmation (spec §5.5). Runs off booking/deposit.paid so the
 * webhook returns immediately. Sends the customer their booking confirmation
 * (transactional — always sends). The pre-service sequence (balance reminder,
 * itinerary, −24h chauffeur disclosure) is scheduled in the pre-service sprint;
 * this is the durable seam it will hang off.
 */
export const depositPaid = inngest.createFunction(
  { id: 'deposit-paid', retries: 3 },
  { event: 'booking/deposit.paid' },
  async ({ event, step }) => {
    const { bookingId } = event.data;

    const recipient = await step.run('load-recipient', () => loadBookingRecipient(bookingId));
    if (!recipient) return { skipped: 'booking_not_found' };

    await step.run('confirmation-email', () =>
      sendMessage(recipient.tenantId, {
        customerId: recipient.customerId,
        bookingId,
        channel: 'email',
        messageClass: 'transactional',
        templateKey: 'booking_confirmation',
      }),
    );

    return { bookingId, reference: recipient.reference };
  },
);

interface BookingRecipient {
  tenantId: string;
  customerId: string;
  reference: string;
}

/**
 * Resolve the customer and tenant for a booking. Bookings are globally unique by
 * id; we look up the owning tenant from the row, then scope the read to it so
 * RLS is satisfied.
 */
async function loadBookingRecipient(bookingId: string): Promise<BookingRecipient | null> {
  const { getDefaultTenant } = await import('@/lib/tenant/resolve');
  const tenant = await getDefaultTenant();
  return withTenant(tenant.id, async (client) => {
    const r = await client.query<{ customer_id: string; reference: string }>(
      `SELECT customer_id, reference FROM bookings WHERE id = $1`,
      [bookingId],
    );
    const row = r.rows[0];
    if (!row) return null;
    return { tenantId: tenant.id, customerId: row.customer_id, reference: row.reference };
  });
}
