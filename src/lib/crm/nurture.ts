import { withTenant } from '@/lib/db/client';
import { recordEvent } from '@/lib/events/publish';
import { sendMessage } from '@/lib/messaging/send';
import { dueNurtureTouches, type JourneyVariant } from '@/lib/domain/nurture/cadence';

/**
 * Nurture ladder (spec §10, BC9). A lead that has gone cold enters a
 * variant-specific nurture sequence rather than being dropped. `enterNurture`
 * moves the enquiry to the nurture stage (satisfying BC9's re-entry-date
 * requirement) and emits the event the durable workflow runs off.
 * `sendDueNurture` dispatches the touches now due — all marketing-class, so the
 * BC6 send gate still governs delivery.
 */

const NURTURE_HORIZON_DAYS = 180;

export interface NurtureContext {
  customerId: string;
  variant: JourneyVariant;
  enteredAt: string;
  stillNurturing: boolean;
  sentCount: number;
}

export async function enterNurture(tenantId: string, enquiryId: string): Promise<void> {
  await withTenant(tenantId, async (client) => {
    const reentry = new Date(Date.now() + NURTURE_HORIZON_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const r = await client.query<{ journey_variant: string }>(
      `UPDATE enquiries
          SET stage = 'nurture', nurture_reentry_date = $2,
              next_action = 'Nurture sequence', next_action_date = now() + interval '3 days',
              updated_at = now()
        WHERE id = $1
        RETURNING journey_variant`,
      [enquiryId, reentry],
    );
    const variant = r.rows[0]?.journey_variant;
    if (!variant) return;
    await recordEvent(client, tenantId, {
      name: 'enquiry/nurture.entered',
      data: { enquiryId, tenantId, variant },
    });
  });
}

/** Load what the nurture workflow needs, and whether the lead is still cold. */
export async function loadNurtureContext(
  tenantId: string,
  enquiryId: string,
): Promise<NurtureContext | null> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query<{
      customer_id: string;
      journey_variant: JourneyVariant;
      stage: string;
      stage_entered_at: string;
      sent: string;
    }>(
      `SELECT e.customer_id, e.journey_variant, e.stage, e.stage_entered_at,
              (SELECT count(*) FROM notifications n
                WHERE n.customer_id = e.customer_id AND n.message_class = 'marketing'
                  AND n.template_key LIKE '%nurture%') AS sent
         FROM enquiries e WHERE e.id = $1`,
      [enquiryId],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      customerId: row.customer_id,
      variant: row.journey_variant,
      enteredAt: row.stage_entered_at,
      stillNurturing: row.stage === 'nurture',
      sentCount: Number(row.sent),
    };
  });
}

/**
 * Dispatch the nurture touches now due for a still-cold lead. Returns how many
 * were sent (respecting the BC6 gate — a suppressed touch still counts as
 * handled and advances the ladder so it is not retried forever).
 */
export async function sendDueNurture(tenantId: string, enquiryId: string): Promise<number> {
  const ctx = await loadNurtureContext(tenantId, enquiryId);
  if (!ctx || !ctx.stillNurturing) return 0;

  const due = dueNurtureTouches(ctx.variant, new Date(ctx.enteredAt), ctx.sentCount, new Date());
  for (const touch of due) {
    await sendMessage(tenantId, {
      customerId: ctx.customerId,
      channel: touch.channel,
      messageClass: 'marketing',
      templateKey: touch.templateKey,
    });
  }
  return due.length;
}
