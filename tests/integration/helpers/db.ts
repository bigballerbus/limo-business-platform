import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

/** Owner connection — migrations/seeds/fixtures (bypasses RLS). */
export const ownerPool = new Pool({ connectionString: process.env.DATABASE_URL });

/** Application connection — non-owner, non-BYPASSRLS (RLS enforced). */
export const appPool = new Pool({
  connectionString: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL,
});

export async function closePools(): Promise<void> {
  await Promise.all([ownerPool.end(), appPool.end()]);
}

/** Short unique suffix for slugs/refs/emails so fixtures never collide. */
export function uid(): string {
  return randomUUID().slice(0, 8);
}

/**
 * Run `fn` in an owner transaction that is ALWAYS rolled back — for constraint
 * tests that must not persist their (deliberately bad) data.
 */
export async function inRollbackTx(fn: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = await ownerPool.connect();
  try {
    await client.query('BEGIN');
    await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

/** Run `fn` as the application role, scoped to a tenant (RLS active). */
export async function appAsTenant<T>(
  tenantId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    }
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

/** Ensure the global lookup rows the fixtures reference exist (committed). */
export async function ensureLookups(): Promise<void> {
  await ownerPool.query(`
    INSERT INTO service_types (code, label) VALUES
      ('wedding','Wedding'),('prom','Prom'),('airport_transfer','Airport Transfer'),
      ('corporate','Corporate'),('celebration','Celebration')
    ON CONFLICT (code) DO NOTHING;
    INSERT INTO vehicle_categories (code, label) VALUES
      ('saloon','Executive Saloon'),('stretch_limo','Stretch Limousine')
    ON CONFLICT (code) DO NOTHING;
  `);
}

// ── Fixture builders (operate inside a caller-provided transaction) ──────────

export async function createTenant(c: PoolClient): Promise<string> {
  const s = uid();
  const r = await c.query<{ id: string }>(
    `INSERT INTO tenants (name, slug, base_location, licensing_authority, operator_licence_no, licence_expiry)
     VALUES ($1,$2, ST_SetSRID(ST_MakePoint(0.52,51.27),4326)::geography, 'Test Authority','TEST-LIC','2030-01-01')
     RETURNING id`,
    [`Test Tenant ${s}`, `test-tenant-${s}`],
  );
  return r.rows[0]!.id;
}

export async function createCustomer(c: PoolClient, tenantId: string): Promise<string> {
  const s = uid();
  const r = await c.query<{ id: string }>(
    `INSERT INTO customers (tenant_id, first_name, last_name, email, mobile, first_touch_source, last_touch_source)
     VALUES ($1,'Test','Customer',$2,'+447000000000','organic','organic')
     RETURNING id`,
    [tenantId, `test-${s}@example.com`],
  );
  return r.rows[0]!.id;
}

export async function createStaff(c: PoolClient, tenantId: string): Promise<string> {
  const r = await c.query<{ id: string }>(
    `INSERT INTO staff (tenant_id, full_name, role, mobile)
     VALUES ($1,'Test Owner','coordinator','+447000000001') RETURNING id`,
    [tenantId],
  );
  return r.rows[0]!.id;
}

export async function createVehicle(
  c: PoolClient,
  tenantId: string,
  capacity = 4,
): Promise<string> {
  const s = uid();
  const r = await c.query<{ id: string }>(
    `INSERT INTO vehicles
       (tenant_id, name, slug, category, make, model, registration, passenger_capacity,
        licence_plate_no, licence_expiry, mot_expiry, insurance_expiry)
     VALUES ($1,$2,$3,'saloon','Make','Model',$4,$5,$4,'2030-01-01','2030-01-01','2030-01-01')
     RETURNING id`,
    [tenantId, `veh-${s}`, `veh-${s}`, `REG-${s}`, capacity],
  );
  return r.rows[0]!.id;
}

interface EnquiryOptions {
  stage?: string;
  serviceType?: string;
  journeyVariant?: string;
  nextAction?: string | null;
  nextActionDate?: string | null;
  under18?: boolean;
  parentVerified?: boolean;
  parentContactId?: string | null;
  source?: string | null;
}

export async function createEnquiry(
  c: PoolClient,
  tenantId: string,
  ownerId: string,
  customerId: string,
  opts: EnquiryOptions = {},
): Promise<string> {
  const s = uid();
  const stage = opts.stage ?? 'quoted';
  const r = await c.query<{ id: string }>(
    `INSERT INTO enquiries
       (tenant_id, reference, customer_id, stage, owner_id, service_type, journey_variant,
        event_date, pickup_postcode, passenger_count, source,
        next_action, next_action_date, under_18_passengers, parent_guardian_verified, parent_contact_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'2030-06-01','ME14 1AA',2,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      tenantId,
      `ENQ-${s}`,
      customerId,
      stage,
      ownerId,
      opts.serviceType ?? 'wedding',
      opts.journeyVariant ?? 'wedding',
      opts.source === undefined ? 'organic' : opts.source,
      opts.nextAction === undefined ? 'Call customer' : opts.nextAction,
      opts.nextActionDate === undefined
        ? new Date(Date.now() + 86400000).toISOString()
        : opts.nextActionDate,
      opts.under18 ?? false,
      opts.parentVerified ?? false,
      opts.parentContactId ?? null,
    ],
  );
  return r.rows[0]!.id;
}

interface BookingOptions {
  serviceType?: string;
  status?: string;
  backupVehicleId?: string | null;
}

export async function createBooking(
  c: PoolClient,
  tenantId: string,
  enquiryId: string,
  customerId: string,
  opts: BookingOptions = {},
): Promise<string> {
  const s = uid();
  const r = await c.query<{ id: string }>(
    `INSERT INTO bookings
       (tenant_id, reference, enquiry_id, customer_id, service_type, status,
        pickup_at, estimated_end_at, passenger_count,
        total_pence, deposit_pence, balance_pence, balance_due_date, backup_vehicle_id)
     VALUES ($1,$2,$3,$4,$5,$6,
        '2030-06-01T10:00:00Z','2030-06-01T14:00:00Z',2,
        50000,15000,35000,'2030-05-25',$7)
     RETURNING id`,
    [
      tenantId,
      `BKG-${s}`,
      enquiryId,
      customerId,
      opts.serviceType ?? 'airport_transfer',
      opts.status ?? 'deposit_paid',
      opts.backupVehicleId ?? null,
    ],
  );
  return r.rows[0]!.id;
}
