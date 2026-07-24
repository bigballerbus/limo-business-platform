import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appClientPool } from '@/lib/db/client';
import { calculateQuote } from '@/lib/domain/pricing/engine';
import { PLACEHOLDER_RATE_CARD } from '@/lib/domain/pricing/ratecard';
import { toPricingInput } from '@/lib/domain/quote/mapToPricing';
import { captureQuoteLead } from '@/lib/crm/leadCapture';
import {
  GuardianNotVerifiedError,
  confirmDepositAndAssign,
  createBookingFromQuote,
} from '@/lib/crm/booking';
import { QuoteSubmissionSchema, type QuoteSubmission } from '@/lib/schemas/quote';
import { closePools, ownerPool, uid } from './helpers/db';

/**
 * Booking & deposit critical path (§5–6). Proves: a booking is created from an
 * accepted quote with a deposit intent; the deposit-succeeded path locks the
 * vehicle + chauffeur and confirms; a BC5 resource clash rolls the locks back
 * and auto-refunds; the webhook is idempotent; and BC2 blocks a deposit on an
 * unverified minors booking.
 */
describe('booking deposit + resource locking', () => {
  let tenantId: string;
  let base: { lng: number; lat: number };
  let vehicleId: string;
  let chauffeurA: string;
  let chauffeurB: string;
  const emails: string[] = [];
  const bookingIds: string[] = [];

  beforeAll(async () => {
    const t = await ownerPool.query<{ id: string; lng: number; lat: number }>(
      `SELECT id, ST_X(base_location::geometry) AS lng, ST_Y(base_location::geometry) AS lat
         FROM tenants ORDER BY created_at LIMIT 1`,
    );
    tenantId = t.rows[0]!.id;
    base = { lng: t.rows[0]!.lng, lat: t.rows[0]!.lat };

    const s = uid();
    const v = await ownerPool.query<{ id: string }>(
      `INSERT INTO vehicles
         (tenant_id, name, slug, category, make, model, registration, passenger_capacity,
          licence_plate_no, licence_expiry, mot_expiry, insurance_expiry, status)
       VALUES ($1,$2,$3,'saloon','Make','Model',$4,8,$4,'2035-01-01','2035-01-01','2035-01-01','active')
       RETURNING id`,
      [tenantId, `bk-veh-${s}`, `bk-veh-${s}`, `BKREG-${s}`],
    );
    vehicleId = v.rows[0]!.id;

    const a = await ownerPool.query<{ id: string }>(
      `INSERT INTO staff (tenant_id, full_name, role, mobile, status)
       VALUES ($1,'Booking Chauffeur A','chauffeur',$2,'active') RETURNING id`,
      [tenantId, `+4470000${s.slice(0, 4)}1`],
    );
    chauffeurA = a.rows[0]!.id;
    const b = await ownerPool.query<{ id: string }>(
      `INSERT INTO staff (tenant_id, full_name, role, mobile, status)
       VALUES ($1,'Booking Chauffeur B','chauffeur',$2,'active') RETURNING id`,
      [tenantId, `+4470000${s.slice(0, 4)}2`],
    );
    chauffeurB = b.rows[0]!.id;
  });

  afterAll(async () => {
    if (bookingIds.length) {
      await ownerPool.query(`DELETE FROM payments WHERE booking_id = ANY($1)`, [bookingIds]);
      await ownerPool.query(`DELETE FROM booking_resources WHERE booking_id = ANY($1)`, [
        bookingIds,
      ]);
      await ownerPool.query(`DELETE FROM audit_logs WHERE after_state->>'bookingId' = ANY($1)`, [
        bookingIds,
      ]);
      await ownerPool.query(`DELETE FROM bookings WHERE id = ANY($1)`, [bookingIds]);
    }
    if (emails.length) {
      await ownerPool.query(
        `DELETE FROM quotes WHERE enquiry_id IN (
           SELECT e.id FROM enquiries e JOIN customers c ON c.id = e.customer_id WHERE c.email = ANY($1))`,
        [emails],
      );
      await ownerPool.query(
        `DELETE FROM enquiries WHERE customer_id IN (SELECT id FROM customers WHERE email = ANY($1))`,
        [emails],
      );
      await ownerPool.query(`DELETE FROM customers WHERE email = ANY($1)`, [emails]);
    }
    if (vehicleId) await ownerPool.query(`DELETE FROM vehicles WHERE id = $1`, [vehicleId]);
    if (chauffeurA)
      await ownerPool.query(`DELETE FROM staff WHERE id = ANY($1)`, [[chauffeurA, chauffeurB]]);
    await closePools();
    await appClientPool.end();
  });

  async function enquiryWithQuote(over: Record<string, unknown> = {}): Promise<string> {
    const email = `bk-${uid()}@example.com`;
    emails.push(email);
    const submission: QuoteSubmission = QuoteSubmissionSchema.parse({
      occasion: 'celebration',
      eventDate: new Date(Date.now() + 60 * 86400000).toISOString(),
      pickupPostcode: 'ME14 1AA',
      destinationType: 'return',
      passengerCount: 2,
      durationHours: 3,
      vehicleTier: 'saloon',
      addons: [],
      contact: { firstName: 'Book', lastName: 'Customer', email, mobile: '07123456789' },
      attribution: { firstTouch: 'organic', lastTouch: 'organic' },
      ...over,
    });
    const pricing = calculateQuote(
      toPricingInput(submission, {
        base,
        pickup: { lng: base.lng + 0.02, lat: base.lat + 0.01 },
        destination: base,
      }),
      PLACEHOLDER_RATE_CARD,
    );
    const lead = await captureQuoteLead(tenantId, { submission, pricing });
    return lead.enquiryId;
  }

  it('creates a booking and a pending deposit from an accepted quote', async () => {
    const enquiryId = await enquiryWithQuote();
    const created = await createBookingFromQuote(tenantId, {
      enquiryId,
      pickupAt: new Date('2031-01-10T10:00:00Z'),
      estimatedEndAt: new Date('2031-01-10T13:00:00Z'),
      termsAccepted: true,
    });
    bookingIds.push(created.bookingId);

    expect(created.reference).toMatch(/^BKG-/);
    expect(created.clientSecret).toContain('secret');
    expect(created.depositPence).toBeGreaterThan(0);
    expect(created.depositPence + created.balancePence).toBeGreaterThan(created.depositPence - 1);

    const payment = await ownerPool.query(
      `SELECT type, status FROM payments WHERE stripe_payment_intent_id = $1`,
      [created.intentId],
    );
    expect(payment.rows[0]).toMatchObject({ type: 'deposit', status: 'pending' });
  });

  it('confirms and locks vehicle + chauffeur on deposit success', async () => {
    const enquiryId = await enquiryWithQuote();
    const created = await createBookingFromQuote(tenantId, {
      enquiryId,
      pickupAt: new Date('2031-02-10T10:00:00Z'),
      estimatedEndAt: new Date('2031-02-10T13:00:00Z'),
      termsAccepted: true,
    });
    bookingIds.push(created.bookingId);

    const result = await confirmDepositAndAssign(tenantId, {
      intentId: created.intentId,
      assignment: { vehicleId, chauffeurId: chauffeurA },
    });
    expect(result.status).toBe('confirmed');

    const booking = await ownerPool.query(
      `SELECT status, deposit_paid_at FROM bookings WHERE id = $1`,
      [created.bookingId],
    );
    expect(booking.rows[0].status).toBe('confirmed');
    expect(booking.rows[0].deposit_paid_at).not.toBeNull();

    const resources = await ownerPool.query(
      `SELECT resource_type FROM booking_resources WHERE booking_id = $1 ORDER BY resource_type`,
      [created.bookingId],
    );
    expect(resources.rows.map((r) => r.resource_type).sort()).toEqual(['chauffeur', 'vehicle']);

    const deposit = await ownerPool.query(
      `SELECT status FROM payments WHERE stripe_payment_intent_id = $1`,
      [created.intentId],
    );
    expect(deposit.rows[0].status).toBe('succeeded');
  });

  it('is idempotent on a redelivered deposit-succeeded webhook', async () => {
    const enquiryId = await enquiryWithQuote();
    const created = await createBookingFromQuote(tenantId, {
      enquiryId,
      pickupAt: new Date('2031-03-10T10:00:00Z'),
      estimatedEndAt: new Date('2031-03-10T13:00:00Z'),
      termsAccepted: true,
    });
    bookingIds.push(created.bookingId);

    const first = await confirmDepositAndAssign(tenantId, {
      intentId: created.intentId,
      assignment: { vehicleId, chauffeurId: chauffeurA },
    });
    expect(first.status).toBe('confirmed');

    const second = await confirmDepositAndAssign(tenantId, {
      intentId: created.intentId,
      assignment: { vehicleId, chauffeurId: chauffeurA },
    });
    expect(second.status).toBe('already_processed');

    const resources = await ownerPool.query(
      `SELECT count(*)::int AS n FROM booking_resources WHERE booking_id = $1`,
      [created.bookingId],
    );
    expect(resources.rows[0].n).toBe(2);
  });

  it('rolls back and auto-refunds when the vehicle is already taken (BC5)', async () => {
    // First booking takes the vehicle for a window.
    const firstEnquiry = await enquiryWithQuote();
    const first = await createBookingFromQuote(tenantId, {
      enquiryId: firstEnquiry,
      pickupAt: new Date('2031-04-10T10:00:00Z'),
      estimatedEndAt: new Date('2031-04-10T14:00:00Z'),
      termsAccepted: true,
    });
    bookingIds.push(first.bookingId);
    const firstResult = await confirmDepositAndAssign(tenantId, {
      intentId: first.intentId,
      assignment: { vehicleId, chauffeurId: chauffeurA },
    });
    expect(firstResult.status).toBe('confirmed');

    // Second booking wants the SAME vehicle for an overlapping window.
    const secondEnquiry = await enquiryWithQuote();
    const second = await createBookingFromQuote(tenantId, {
      enquiryId: secondEnquiry,
      pickupAt: new Date('2031-04-10T12:00:00Z'),
      estimatedEndAt: new Date('2031-04-10T16:00:00Z'),
      termsAccepted: true,
    });
    bookingIds.push(second.bookingId);
    const secondResult = await confirmDepositAndAssign(tenantId, {
      intentId: second.intentId,
      assignment: { vehicleId, chauffeurId: chauffeurB },
    });
    expect(secondResult.status).toBe('refunded');

    // The clashing booking is cancelled with no lingering resource locks.
    const booking = await ownerPool.query(
      `SELECT status, cancellation_reason, refund_pence FROM bookings WHERE id = $1`,
      [second.bookingId],
    );
    expect(booking.rows[0].status).toBe('cancelled');
    expect(booking.rows[0].cancellation_reason).toBe('resource_unavailable');
    expect(booking.rows[0].refund_pence).toBe(second.depositPence);

    const locks = await ownerPool.query(
      `SELECT count(*)::int AS n FROM booking_resources WHERE booking_id = $1`,
      [second.bookingId],
    );
    expect(locks.rows[0].n).toBe(0);

    // A refund payment was recorded against the deposit.
    const refund = await ownerPool.query(
      `SELECT amount_pence, status FROM payments WHERE booking_id = $1 AND type = 'refund'`,
      [second.bookingId],
    );
    expect(refund.rows[0]).toMatchObject({ amount_pence: second.depositPence, status: 'refunded' });
  });

  it('refuses a deposit on an unverified minors booking (BC2)', async () => {
    const enquiryId = await enquiryWithQuote({
      occasion: 'prom',
      vehicleTier: 'stretch_limo',
      hasMinors: true,
      parentGuardian: {
        firstName: 'Guard',
        lastName: 'Ian',
        email: `guard-${uid()}@example.com`,
        mobile: '07999000111',
      },
    });
    await expect(
      createBookingFromQuote(tenantId, {
        enquiryId,
        pickupAt: new Date('2031-05-10T10:00:00Z'),
        estimatedEndAt: new Date('2031-05-10T13:00:00Z'),
        termsAccepted: true,
      }),
    ).rejects.toBeInstanceOf(GuardianNotVerifiedError);
  });
});
