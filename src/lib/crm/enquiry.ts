import { withTenant } from '@/lib/db/client';

export interface EnquiryContext {
  customerId: string;
  ownerId: string;
  reference: string;
  quotedValuePence: number | null;
}

export async function loadEnquiryContext(
  tenantId: string,
  enquiryId: string,
): Promise<EnquiryContext | null> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query<{
      customer_id: string;
      owner_id: string;
      reference: string;
      quoted_value_pence: number | null;
    }>(`SELECT customer_id, owner_id, reference, quoted_value_pence FROM enquiries WHERE id = $1`, [
      enquiryId,
    ]);
    const row = r.rows[0];
    if (!row) return null;
    return {
      customerId: row.customer_id,
      ownerId: row.owner_id,
      reference: row.reference,
      quotedValuePence: row.quoted_value_pence,
    };
  });
}

/**
 * The audible owner alert (§2.4). The durable record is an activity on the
 * enquiry; the real push/SMS to the owner's device is dispatched by the notifier
 * in the integrations sprint.
 */
export async function alertOwner(
  tenantId: string,
  enquiryId: string,
  ownerId: string,
): Promise<void> {
  await withTenant(tenantId, async (client) => {
    await client.query(
      `INSERT INTO activities (tenant_id, enquiry_id, type, direction, body, staff_id)
       VALUES ($1,$2,'system','outbound','New enquiry — respond within 5 minutes',$3)`,
      [tenantId, enquiryId, ownerId],
    );
  });
}
