import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool as appClientPool } from '@/lib/db/client';
import { calculateQuote } from '@/lib/domain/pricing/engine';
import { PLACEHOLDER_RATE_CARD } from '@/lib/domain/pricing/ratecard';
import { toPricingInput } from '@/lib/domain/quote/mapToPricing';
import { captureQuoteLead } from '@/lib/crm/leadCapture';
import {
  confirmBalancePaid,
  confirmDepositAndAssign,
  createBalanceIntent,
  createBookingFromQuote,
  dispatchJourney,
  loadServiceContext,
} from '@/lib/crm/booking';
import { QuoteSubmissionSchema, type QuoteSubmission } from '@/lib/schemas/quote';
import { closePools, ownerPool, uid } from './helpers/db';

/**
 * Pre-service critical path (§5.6): balance capture and journey dispatch on a
 * confirmed booking. Proves the balance webhook is idempotent, the service
 * context resolves the assigned chauffeur for the −24h disclosure, and dispatch
 * creates exactly one journey and puts the booking in service.
 */
describe('pre-service: balance + dispatch', () => {
  let tenantId: string;
  let base: { lng: number; lat: number };
  let vehicleId: string;
  let chauffeurId: string;
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
      [tenantId, `ps-veh-${s}`, `ps-veh-${s}`, `PSREG-${s}`],
    );
    vehicleId = v.rows[0]!.id;
    const c = await ownerPool.query<{ id: string }>(
      `INSERT INTO staff (tenant_id, full_name, role, mobile, status)
       VALUES ($1,'Pre-service Chauffeur','chauffeur',$2,'active') RETURNING id`,
      [tenantId, `+4470001${s.slice(0, 4)}`],
    );
    chauffeurId = c.rows[0]!.id;
  });

  afterAll(async () => {
    if (bookingIds.length) {
      await ownerPool.query(`DELETE FROM journeys WHERE booking_id = ANY($1)`, [bookingIds]);
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
    if (chauffeurId) await ownerPool.query(`DELETE FROM staff WHERE id = $1`, [chauffeurId]);
    await closePools();
    await appClientPool.end();
  });

  async function confirmedBooking(
    pickupAt: Date,
    estimatedEndAt: Date,
  ): Promise<{ bookingId: string; balancePence: number }> {
    const email = `ps-${uid()}@example.com`;
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
      contact: { firstName: 'Pre', lastName: 'Service', email, mobile: '07123456789' },
      attribution: { firstTouch: 'organic', lastTouch: 'organic' },
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
    const created = await createBookingFromQuote(tenantId, {
      enquiryId: lead.enquiryId,
      pickupAt,
      estimatedEndAt,
      termsAccepted: true,
    });
    bookingIds.push(created.bookingId);
    await confirmDepositAndAssign(tenantId, {
      intentId: created.intentId,
      assignment: { vehicleId, chauffeurId },
    });
    return { bookingId: created.bookingId, balancePence: created.balancePence };
  }

  it('resolves the assigned chauffeur for the −24h disclosure', async () => {
    const { bookingId } = await confirmedBooking(
      new Date('2031-06-10T10:00:00Z'),
      new Date('2031-06-10T13:00:00Z'),
    );
    const ctx = await loadServiceContext(tenantId, bookingId);
    expect(ctx?.chauffeurId).toBe(chauffeurId);
    expect(ctx?.vehicleId).toBe(vehicleId);
  });

  it('captures the balance and is idempotent on a redelivered webhook', async () => {
    const { bookingId, balancePence } = await confirmedBooking(
      new Date('2031-07-10T10:00:00Z'),
      new Date('2031-07-10T13:00:00Z'),
    );

    const intent = await createBalanceIntent(tenantId, bookingId);
    expect(intent.balancePence).toBe(balancePence);

    const first = await confirmBalancePaid(tenantId, intent.intentId);
    expect(first.status).toBe('paid');
    const second = await confirmBalancePaid(tenantId, intent.intentId);
    expect(second.status).toBe('already_processed');

    const booking = await ownerPool.query(`SELECT balance_paid_at FROM bookings WHERE id = $1`, [
      bookingId,
    ]);
    expect(booking.rows[0].balance_paid_at).not.toBeNull();

    const balancePayments = await ownerPool.query(
      `SELECT count(*)::int AS n FROM payments WHERE booking_id = $1 AND type = 'balance' AND status = 'succeeded'`,
      [bookingId],
    );
    expect(balancePayments.rows[0].n).toBe(1);
  });

  it('dispatches exactly one journey and puts the booking in service', async () => {
    const { bookingId } = await confirmedBooking(
      new Date('2031-08-10T10:00:00Z'),
      new Date('2031-08-10T13:00:00Z'),
    );

    const first = await dispatchJourney(tenantId, bookingId);
    const second = await dispatchJourney(tenantId, bookingId);
    expect(first?.journeyId).toBe(second?.journeyId);

    const journeys = await ownerPool.query(
      `SELECT count(*)::int AS n FROM journeys WHERE booking_id = $1`,
      [bookingId],
    );
    expect(journeys.rows[0].n).toBe(1);

    const booking = await ownerPool.query(`SELECT status FROM bookings WHERE id = $1`, [bookingId]);
    expect(booking.rows[0].status).toBe('in_service');
  });
});
