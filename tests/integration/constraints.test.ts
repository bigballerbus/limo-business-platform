import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import {
  closePools,
  createBooking,
  createCustomer,
  createEnquiry,
  createStaff,
  createTenant,
  createVehicle,
  ensureLookups,
  inRollbackTx,
} from './helpers/db';

/** Assert a query rejects with a specific Postgres error code (and constraint). */
async function expectViolation(
  promise: Promise<unknown>,
  code: string,
  constraint?: string,
): Promise<void> {
  let raised: { code?: string; constraint?: string } | undefined;
  try {
    await promise;
  } catch (error) {
    raised = error as { code?: string; constraint?: string };
  }
  expect(raised, 'expected the write to be rejected, but it succeeded').toBeDefined();
  expect(raised?.code).toBe(code);
  if (constraint) expect(raised?.constraint).toBe(constraint);
}

const CHECK = '23514';
const EXCLUSION = '23P01';

beforeAll(async () => {
  await ensureLookups();
});
afterAll(async () => {
  await closePools();
});

describe('BC1 — vehicle passenger capacity ≤ 8', () => {
  it('rejects a 9-seat vehicle', async () => {
    await inRollbackTx(async (c) => {
      const tenant = await createTenant(c);
      await expectViolation(createVehicle(c, tenant, 9), CHECK, 'capacity_phv_limit');
    });
  });
  it('accepts an 8-seat vehicle', async () => {
    await inRollbackTx(async (c) => {
      const tenant = await createTenant(c);
      await expect(createVehicle(c, tenant, 8)).resolves.toBeTruthy();
    });
  });
});

describe('BC9 — every open lead has a dated next action', () => {
  it('rejects a quoted enquiry with no next action', async () => {
    await inRollbackTx(async (c) => {
      const tenant = await createTenant(c);
      const owner = await createStaff(c, tenant);
      const customer = await createCustomer(c, tenant);
      await expectViolation(
        createEnquiry(c, tenant, owner, customer, {
          stage: 'quoted',
          nextAction: null,
          nextActionDate: null,
        }),
        CHECK,
        'next_action_required',
      );
    });
  });
});

describe('BC2 — under-18 requires a verified guardian past the early stages', () => {
  it('rejects a confirmed enquiry carrying minors without a verified parent', async () => {
    await inRollbackTx(async (c) => {
      const tenant = await createTenant(c);
      const owner = await createStaff(c, tenant);
      const customer = await createCustomer(c, tenant);
      await expectViolation(
        createEnquiry(c, tenant, owner, customer, {
          stage: 'confirmed',
          journeyVariant: 'prom',
          serviceType: 'prom',
          under18: true,
          parentVerified: false,
        }),
        CHECK,
        'under_18_requires_parent',
      );
    });
  });
  it('accepts minors at the enquiry stage before verification', async () => {
    await inRollbackTx(async (c) => {
      const tenant = await createTenant(c);
      const owner = await createStaff(c, tenant);
      const customer = await createCustomer(c, tenant);
      await expect(
        createEnquiry(c, tenant, owner, customer, {
          stage: 'quoted',
          journeyVariant: 'prom',
          serviceType: 'prom',
          under18: true,
        }),
      ).resolves.toBeTruthy();
    });
  });
});

describe('BC3 — no quote below 35% contribution margin', () => {
  async function insertQuote(c: PoolClient, tenant: string, marginPct: number): Promise<unknown> {
    const owner = await createStaff(c, tenant);
    const customer = await createCustomer(c, tenant);
    const enquiry = await createEnquiry(c, tenant, owner, customer);
    return c.query(
      `INSERT INTO quotes
         (tenant_id, enquiry_id, base_pence, distance_multiplier, seasonal_multiplier,
          day_time_multiplier, total_pence, net_pence, estimated_cost_pence,
          contribution_margin_pct, valid_until)
       VALUES ($1,$2,40000,1.15,1.00,1.10,74400,74400,40000,$3,'2030-01-01')`,
      [tenant, enquiry, marginPct],
    );
  }
  it('rejects a 30% margin quote', async () => {
    await inRollbackTx(async (c) => {
      const tenant = await createTenant(c);
      await expectViolation(insertQuote(c, tenant, 30), CHECK, 'margin_floor');
    });
  });
  it('accepts a 40% margin quote', async () => {
    await inRollbackTx(async (c) => {
      const tenant = await createTenant(c);
      await expect(insertQuote(c, tenant, 40)).resolves.toBeTruthy();
    });
  });
});

describe('BC4 — weddings require a backup vehicle once past deposit', () => {
  it('rejects a confirmed wedding booking with no backup vehicle', async () => {
    await inRollbackTx(async (c) => {
      const tenant = await createTenant(c);
      const owner = await createStaff(c, tenant);
      const customer = await createCustomer(c, tenant);
      const enquiry = await createEnquiry(c, tenant, owner, customer);
      await expectViolation(
        createBooking(c, tenant, enquiry, customer, {
          serviceType: 'wedding',
          status: 'confirmed',
          backupVehicleId: null,
        }),
        CHECK,
        'wedding_requires_backup',
      );
    });
  });
  it('accepts a confirmed wedding booking with a backup vehicle', async () => {
    await inRollbackTx(async (c) => {
      const tenant = await createTenant(c);
      const owner = await createStaff(c, tenant);
      const customer = await createCustomer(c, tenant);
      const enquiry = await createEnquiry(c, tenant, owner, customer);
      const backup = await createVehicle(c, tenant, 8);
      await expect(
        createBooking(c, tenant, enquiry, customer, {
          serviceType: 'wedding',
          status: 'confirmed',
          backupVehicleId: backup,
        }),
      ).resolves.toBeTruthy();
    });
  });
});

describe('BC5 — no vehicle can hold two overlapping bookings', () => {
  async function addResource(
    c: PoolClient,
    tenant: string,
    booking: string,
    vehicle: string,
    from: string,
    to: string,
    isBackup = false,
  ): Promise<unknown> {
    return c.query(
      `INSERT INTO booking_resources (tenant_id, booking_id, resource_type, vehicle_id, period, is_backup)
       VALUES ($1,$2,'vehicle',$3, tstzrange($4::timestamptz,$5::timestamptz), $6)`,
      [tenant, booking, vehicle, from, to, isBackup],
    );
  }

  it('rejects an overlapping second assignment of the same vehicle', async () => {
    await inRollbackTx(async (c) => {
      const tenant = await createTenant(c);
      const owner = await createStaff(c, tenant);
      const customer = await createCustomer(c, tenant);
      const vehicle = await createVehicle(c, tenant, 8);
      const enquiry = await createEnquiry(c, tenant, owner, customer);
      const booking = await createBooking(c, tenant, enquiry, customer, { status: 'deposit_paid' });
      await addResource(
        c,
        tenant,
        booking,
        vehicle,
        '2030-06-01T10:00:00Z',
        '2030-06-01T14:00:00Z',
      );
      await expectViolation(
        addResource(c, tenant, booking, vehicle, '2030-06-01T12:00:00Z', '2030-06-01T16:00:00Z'),
        EXCLUSION,
      );
    });
  });

  it('allows a non-overlapping second assignment of the same vehicle', async () => {
    await inRollbackTx(async (c) => {
      const tenant = await createTenant(c);
      const owner = await createStaff(c, tenant);
      const customer = await createCustomer(c, tenant);
      const vehicle = await createVehicle(c, tenant, 8);
      const enquiry = await createEnquiry(c, tenant, owner, customer);
      const booking = await createBooking(c, tenant, enquiry, customer, { status: 'deposit_paid' });
      await addResource(
        c,
        tenant,
        booking,
        vehicle,
        '2030-06-01T10:00:00Z',
        '2030-06-01T14:00:00Z',
      );
      await expect(
        addResource(c, tenant, booking, vehicle, '2030-06-01T15:00:00Z', '2030-06-01T18:00:00Z'),
      ).resolves.toBeTruthy();
    });
  });
});

describe('other database guarantees', () => {
  it('media containing people requires consent', async () => {
    await inRollbackTx(async (c) => {
      const tenant = await createTenant(c);
      await expectViolation(
        c.query(
          `INSERT INTO media (tenant_id, filename, storage_key, mime_type, width, height, filesize_bytes, alt_text, contains_people, consent_obtained)
           VALUES ($1,'chauffeur-and-couple-at-leeds-castle.jpg','k','image/jpeg',1600,900,120000,'A couple beside the wedding car',true,false)`,
          [tenant],
        ),
        CHECK,
        'people_require_consent',
      );
    });
  });

  it('a booking resource must be exactly one of vehicle or chauffeur', async () => {
    await inRollbackTx(async (c) => {
      const tenant = await createTenant(c);
      const owner = await createStaff(c, tenant);
      const customer = await createCustomer(c, tenant);
      const vehicle = await createVehicle(c, tenant, 8);
      const enquiry = await createEnquiry(c, tenant, owner, customer);
      const booking = await createBooking(c, tenant, enquiry, customer, { status: 'deposit_paid' });
      await expectViolation(
        c.query(
          `INSERT INTO booking_resources (tenant_id, booking_id, resource_type, vehicle_id, staff_id, period)
           VALUES ($1,$2,'vehicle',$3,$4, tstzrange(now(), now() + interval '2 hours'))`,
          [tenant, booking, vehicle, owner],
        ),
        CHECK,
        'resource_exactly_one',
      );
    });
  });
});
