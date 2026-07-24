import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTenant } from '@/lib/db/client';
import { recordEvent } from '@/lib/events/publish';
import { canTakeDeposit } from '@/lib/domain/safeguarding/rules';
import {
  PLACEHOLDER_DEPOSIT_POLICY,
  balanceDueDate,
  splitDeposit,
  type DepositPolicy,
} from '@/lib/domain/booking/deposit';
import { planResources } from '@/lib/domain/booking/resources';
import { stubPayments } from '@/lib/payments/stub';
import type { PaymentProvider } from '@/lib/payments/provider';

/**
 * Booking & deposit critical path (spec §5–6, BC2/BC4/BC5).
 *
 *  createBookingFromQuote — turns an accepted quote into a pending booking and
 *  a deposit payment intent. It refuses to take a deposit on a minors booking
 *  until the guardian is verified (BC2 gate, mirroring the database CHECK).
 *
 *  confirmDepositAndAssign — runs on the deposit-succeeded webhook. It captures
 *  the deposit and locks the vehicle + chauffeur (+ wedding backup, BC4) inside
 *  one transaction. Resource locking is wrapped in a SAVEPOINT: if the BC5
 *  EXCLUDE constraint fires (a concurrent booking took the vehicle), the locks
 *  roll back, the booking is cancelled, and the deposit is automatically
 *  refunded — we never hold money we cannot fulfil.
 */

const EXCLUSION_VIOLATION = '23P01';

export class GuardianNotVerifiedError extends Error {
  constructor() {
    super(
      'Cannot take a deposit for a booking carrying minors until the guardian is verified (BC2)',
    );
    this.name = 'GuardianNotVerifiedError';
  }
}

export class QuoteNotBookableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteNotBookableError';
  }
}

function reference(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface CreateBookingInput {
  enquiryId: string;
  pickupAt: Date;
  estimatedEndAt: Date;
  pickupAddress?: Record<string, unknown>;
  destinations?: unknown[];
  termsAccepted: boolean;
  policy?: DepositPolicy;
  provider?: PaymentProvider;
}

export interface CreateBookingResult {
  bookingId: string;
  reference: string;
  clientSecret: string;
  intentId: string;
  depositPence: number;
  balancePence: number;
}

export async function createBookingFromQuote(
  tenantId: string,
  input: CreateBookingInput,
): Promise<CreateBookingResult> {
  const policy = input.policy ?? PLACEHOLDER_DEPOSIT_POLICY;
  const provider = input.provider ?? stubPayments;

  return withTenant(tenantId, async (client) => {
    const enq = await client.query<{
      customer_id: string;
      service_type: string;
      venue_id: string | null;
      passenger_count: number;
      quoted_value_pence: number | null;
      under_18_passengers: boolean;
      parent_guardian_verified: boolean;
    }>(
      `SELECT customer_id, service_type, venue_id, passenger_count, quoted_value_pence,
              under_18_passengers, parent_guardian_verified
         FROM enquiries WHERE id = $1`,
      [input.enquiryId],
    );
    const e = enq.rows[0];
    if (!e) throw new QuoteNotBookableError('Enquiry not found');
    if (e.quoted_value_pence == null) {
      throw new QuoteNotBookableError('Enquiry has no quote to book against');
    }

    // BC2 — no deposit on a minors booking until the guardian is verified.
    if (
      !canTakeDeposit({
        underEighteen: e.under_18_passengers,
        guardianVerified: e.parent_guardian_verified,
      })
    ) {
      throw new GuardianNotVerifiedError();
    }

    const totalPence = e.quoted_value_pence;
    const { depositPence, balancePence } = splitDeposit(totalPence, policy);
    const dueDate = isoDate(balanceDueDate(input.pickupAt, policy.balanceDueDaysBeforePickup));
    const bookingRef = reference('BKG');

    const booking = await client.query<{ id: string }>(
      `INSERT INTO bookings
         (tenant_id, reference, enquiry_id, customer_id, status, service_type, venue_id,
          pickup_at, estimated_end_at, pickup_address, destinations, passenger_count,
          total_pence, vat_pence, deposit_pence, balance_pence, balance_due_date, terms_accepted_at)
       VALUES ($1,$2,$3,$4,'pending_deposit',$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,
               $12,0,$13,$14,$15,$16)
       RETURNING id`,
      [
        tenantId,
        bookingRef,
        input.enquiryId,
        e.customer_id,
        e.service_type,
        e.venue_id,
        input.pickupAt.toISOString(),
        input.estimatedEndAt.toISOString(),
        JSON.stringify(input.pickupAddress ?? {}),
        JSON.stringify(input.destinations ?? []),
        e.passenger_count,
        totalPence,
        depositPence,
        balancePence,
        dueDate,
        input.termsAccepted ? new Date().toISOString() : null,
      ],
    );
    const bookingId = booking.rows[0]!.id;

    const intent = await provider.createDepositIntent({
      bookingId,
      amountPence: depositPence,
      idempotencyKey: bookingId,
    });

    await client.query(
      `INSERT INTO payments
         (tenant_id, booking_id, type, amount_pence, stripe_payment_intent_id, status)
       VALUES ($1,$2,'deposit',$3,$4,'pending')`,
      [tenantId, bookingId, depositPence, intent.intentId],
    );

    return {
      bookingId,
      reference: bookingRef,
      clientSecret: intent.clientSecret,
      intentId: intent.intentId,
      depositPence,
      balancePence,
    };
  });
}

export interface ResourceAssignment {
  vehicleId: string;
  chauffeurId: string;
  backupVehicleId?: string | null;
}

export type ConfirmResult =
  | { status: 'already_processed'; bookingId: string }
  | { status: 'confirmed'; bookingId: string; reference: string }
  | { status: 'refunded'; bookingId: string; reference: string; refundPence: number };

/**
 * Auto-assign a vehicle + chauffeur (and, for weddings, a backup vehicle) that
 * are free for the booking window. The EXCLUDE constraint is the ultimate
 * guarantee; this simply avoids obviously-overlapping picks. Callers may pass an
 * explicit assignment to override (used by dispatch and by tests).
 */
async function autoAssign(
  client: PoolClient,
  tenantId: string,
  booking: {
    id: string;
    service_type: string;
    passenger_count: number;
    pickup_at: string;
    estimated_end_at: string;
  },
): Promise<ResourceAssignment> {
  const freeVehicles = await client.query<{ id: string }>(
    `SELECT v.id FROM vehicles v
      WHERE v.tenant_id = $1 AND v.status = 'active' AND v.passenger_capacity >= $2
        AND NOT EXISTS (
          SELECT 1 FROM booking_resources br
           WHERE br.vehicle_id = v.id AND NOT br.is_backup
             AND br.period && tstzrange($3::timestamptz, $4::timestamptz))
      ORDER BY v.passenger_capacity ASC
      LIMIT 2`,
    [tenantId, booking.passenger_count, booking.pickup_at, booking.estimated_end_at],
  );
  const vehicleId = freeVehicles.rows[0]?.id;
  if (!vehicleId) throw new QuoteNotBookableError('No available vehicle for the booking window');

  const chauffeur = await client.query<{ id: string }>(
    `SELECT s.id FROM staff s
       LEFT JOIN booking_resources br
         ON br.staff_id = s.id AND br.period && tstzrange($2::timestamptz, $3::timestamptz)
      WHERE s.tenant_id = $1 AND s.status = 'active'
      GROUP BY s.id
      ORDER BY count(br.id) ASC
      LIMIT 1`,
    [tenantId, booking.pickup_at, booking.estimated_end_at],
  );
  const chauffeurId = chauffeur.rows[0]?.id;
  if (!chauffeurId)
    throw new QuoteNotBookableError('No available chauffeur for the booking window');

  const backupVehicleId =
    booking.service_type === 'wedding' ? (freeVehicles.rows[1]?.id ?? null) : null;
  return { vehicleId, chauffeurId, backupVehicleId };
}

export interface ConfirmInput {
  intentId: string;
  assignment?: ResourceAssignment;
  provider?: PaymentProvider;
}

export async function confirmDepositAndAssign(
  tenantId: string,
  input: ConfirmInput,
): Promise<ConfirmResult> {
  const provider = input.provider ?? stubPayments;

  const outcome = await withTenant(tenantId, async (client): Promise<ConfirmResult> => {
    const row = await client.query<{
      payment_id: string;
      payment_status: string;
      booking_id: string;
      reference: string;
      booking_status: string;
      service_type: string;
      passenger_count: number;
      pickup_at: string;
      estimated_end_at: string;
      deposit_pence: number;
      refund_recorded: boolean;
    }>(
      `SELECT p.id AS payment_id, p.status AS payment_status,
              b.id AS booking_id, b.reference, b.status AS booking_status, b.service_type,
              b.passenger_count, b.pickup_at, b.estimated_end_at, b.deposit_pence,
              EXISTS (SELECT 1 FROM payments r WHERE r.booking_id = b.id AND r.type = 'refund')
                AS refund_recorded
         FROM payments p JOIN bookings b ON b.id = p.booking_id
        WHERE p.stripe_payment_intent_id = $1 AND p.type = 'deposit'`,
      [input.intentId],
    );
    const r = row.rows[0];
    if (!r) throw new QuoteNotBookableError('No deposit payment for that intent');

    // Idempotency — a redelivered webhook must not double-process. The one gap
    // to reprocess is a cancelled booking whose refund never got recorded
    // (crash between commit and the provider refund call).
    if (r.payment_status === 'succeeded') {
      if (r.booking_status === 'cancelled' && !r.refund_recorded) {
        return {
          status: 'refunded',
          bookingId: r.booking_id,
          reference: r.reference,
          refundPence: r.deposit_pence,
        };
      }
      return { status: 'already_processed', bookingId: r.booking_id };
    }

    const assignment =
      input.assignment ??
      (await autoAssign(client, tenantId, {
        id: r.booking_id,
        service_type: r.service_type,
        passenger_count: r.passenger_count,
        pickup_at: r.pickup_at,
        estimated_end_at: r.estimated_end_at,
      }));

    // BC4 — throws here if a wedding has no backup, before any money moves.
    const plan = planResources({
      serviceType: r.service_type,
      pickupAt: new Date(r.pickup_at),
      estimatedEndAt: new Date(r.estimated_end_at),
      vehicleId: assignment.vehicleId,
      chauffeurId: assignment.chauffeurId,
      backupVehicleId: assignment.backupVehicleId,
    });

    // The deposit really did succeed — record that first, unconditionally.
    await client.query(`UPDATE payments SET status = 'succeeded', paid_at = now() WHERE id = $1`, [
      r.payment_id,
    ]);
    await client.query(
      `UPDATE bookings SET deposit_paid_at = now(), updated_at = now() WHERE id = $1`,
      [r.booking_id],
    );

    await client.query('SAVEPOINT assign_resources');
    try {
      for (const res of plan) {
        await client.query(
          `INSERT INTO booking_resources
             (tenant_id, booking_id, resource_type, vehicle_id, staff_id, period, is_backup)
           VALUES ($1,$2,$3,$4,$5, tstzrange($6::timestamptz,$7::timestamptz), $8)`,
          [
            tenantId,
            r.booking_id,
            res.resourceType,
            res.vehicleId,
            res.staffId,
            res.from.toISOString(),
            res.to.toISOString(),
            res.isBackup,
          ],
        );
      }
      if (r.service_type === 'wedding') {
        await client.query(`UPDATE bookings SET backup_vehicle_id = $2 WHERE id = $1`, [
          r.booking_id,
          assignment.backupVehicleId,
        ]);
      }
      await client.query(
        `UPDATE bookings SET status = 'confirmed', updated_at = now() WHERE id = $1`,
        [r.booking_id],
      );
      await recordEvent(client, tenantId, {
        name: 'booking/deposit.paid',
        data: { bookingId: r.booking_id },
      });
      await recordEvent(client, tenantId, {
        name: 'booking/confirmed',
        data: { bookingId: r.booking_id },
      });
      return { status: 'confirmed', bookingId: r.booking_id, reference: r.reference };
    } catch (error) {
      if ((error as { code?: string }).code !== EXCLUSION_VIOLATION) throw error;
      // BC5 — a concurrent booking took the resource. Undo the locks, cancel,
      // and mark the deposit for automatic refund.
      await client.query('ROLLBACK TO SAVEPOINT assign_resources');
      await client.query(
        `UPDATE bookings
            SET status = 'cancelled', cancelled_at = now(),
                cancellation_reason = 'resource_unavailable',
                refund_pence = deposit_pence, updated_at = now()
          WHERE id = $1`,
        [r.booking_id],
      );
      await recordEvent(client, tenantId, {
        name: 'booking/cancelled',
        data: { bookingId: r.booking_id, reason: 'resource_unavailable' },
      });
      return {
        status: 'refunded',
        bookingId: r.booking_id,
        reference: r.reference,
        refundPence: r.deposit_pence,
      };
    }
  });

  // The provider refund is a side effect, issued after the transaction commits
  // so it never runs against work that rolled back. It is recorded in its own
  // transaction; the idempotency guard above re-drives it if this step crashed.
  if (outcome.status === 'refunded') {
    const refund = await provider.refund({
      intentId: input.intentId,
      amountPence: outcome.refundPence,
      reason: 'resource_unavailable',
    });
    await withTenant(tenantId, async (client) => {
      await client.query(
        `INSERT INTO payments
           (tenant_id, booking_id, type, amount_pence, stripe_refund_id, status, paid_at)
         VALUES ($1,$2,'refund',$3,$4,'refunded', now())`,
        [tenantId, outcome.bookingId, refund.amountPence, refund.refundId],
      );
      await recordEvent(client, tenantId, {
        name: 'booking/refunded',
        data: {
          bookingId: outcome.bookingId,
          amountPence: refund.amountPence,
          reason: 'resource_unavailable',
        },
      });
    });
  }

  return outcome;
}

// ── Pre-service: balance capture and dispatch (spec §5.6) ────────────────────

export interface BalanceIntentResult {
  bookingId: string;
  intentId: string;
  clientSecret: string;
  balancePence: number;
}

/**
 * Create the balance payment intent for a confirmed booking, chased by the
 * −7-day balance reminder. Idempotent by intent id (keyed to the booking) so a
 * repeated reminder never mints a second charge.
 */
export async function createBalanceIntent(
  tenantId: string,
  bookingId: string,
  provider: PaymentProvider = stubPayments,
): Promise<BalanceIntentResult> {
  return withTenant(tenantId, async (client) => {
    const b = await client.query<{ balance_pence: number; balance_paid_at: Date | null }>(
      `SELECT balance_pence, balance_paid_at FROM bookings WHERE id = $1`,
      [bookingId],
    );
    const booking = b.rows[0];
    if (!booking) throw new QuoteNotBookableError('Booking not found');
    if (booking.balance_paid_at) throw new QuoteNotBookableError('Balance already paid');

    const idempotencyKey = `${bookingId}-balance`;
    const existing = await client.query<{ stripe_payment_intent_id: string }>(
      `SELECT stripe_payment_intent_id FROM payments
        WHERE booking_id = $1 AND type = 'balance' AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1`,
      [bookingId],
    );

    const intent = await provider.createDepositIntent({
      bookingId,
      amountPence: booking.balance_pence,
      idempotencyKey,
    });

    if (!existing.rows[0]) {
      await client.query(
        `INSERT INTO payments
           (tenant_id, booking_id, type, amount_pence, stripe_payment_intent_id, status)
         VALUES ($1,$2,'balance',$3,$4,'pending')`,
        [tenantId, bookingId, booking.balance_pence, intent.intentId],
      );
    }

    return {
      bookingId,
      intentId: intent.intentId,
      clientSecret: intent.clientSecret,
      balancePence: booking.balance_pence,
    };
  });
}

export type BalanceResult =
  { status: 'already_processed'; bookingId: string } | { status: 'paid'; bookingId: string };

/** Mark the balance paid on the balance-succeeded webhook. Idempotent. */
export async function confirmBalancePaid(
  tenantId: string,
  intentId: string,
): Promise<BalanceResult> {
  return withTenant(tenantId, async (client) => {
    const p = await client.query<{ id: string; status: string; booking_id: string }>(
      `SELECT id, status, booking_id FROM payments
        WHERE stripe_payment_intent_id = $1 AND type = 'balance'`,
      [intentId],
    );
    const payment = p.rows[0];
    if (!payment) throw new QuoteNotBookableError('No balance payment for that intent');
    if (payment.status === 'succeeded') {
      return { status: 'already_processed', bookingId: payment.booking_id };
    }

    await client.query(`UPDATE payments SET status = 'succeeded', paid_at = now() WHERE id = $1`, [
      payment.id,
    ]);
    await client.query(
      `UPDATE bookings SET balance_paid_at = now(), updated_at = now() WHERE id = $1`,
      [payment.booking_id],
    );
    await recordEvent(client, tenantId, {
      name: 'booking/balance.paid',
      data: { bookingId: payment.booking_id },
    });
    return { status: 'paid', bookingId: payment.booking_id };
  });
}

export interface ServiceContext {
  customerId: string;
  pickupAt: string;
  serviceType: string;
  vehicleId: string | null;
  chauffeurId: string | null;
}

/**
 * Load the pieces the pre-service ladder needs: the customer to message, the
 * pickup time to schedule against, and the assigned (non-backup) vehicle and
 * chauffeur for the itinerary and the −24h chauffeur disclosure.
 */
export async function loadServiceContext(
  tenantId: string,
  bookingId: string,
): Promise<ServiceContext | null> {
  return withTenant(tenantId, async (client) => {
    const r = await client.query<{
      customer_id: string;
      pickup_at: string;
      service_type: string;
      vehicle_id: string | null;
      chauffeur_id: string | null;
    }>(
      `SELECT b.customer_id, b.pickup_at, b.service_type,
              (SELECT vehicle_id FROM booking_resources
                WHERE booking_id = b.id AND resource_type = 'vehicle' AND NOT is_backup LIMIT 1) AS vehicle_id,
              (SELECT staff_id FROM booking_resources
                WHERE booking_id = b.id AND resource_type = 'chauffeur' AND NOT is_backup LIMIT 1) AS chauffeur_id
         FROM bookings b WHERE b.id = $1`,
      [bookingId],
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      customerId: row.customer_id,
      pickupAt: row.pickup_at,
      serviceType: row.service_type,
      vehicleId: row.vehicle_id,
      chauffeurId: row.chauffeur_id,
    };
  });
}

export interface DispatchResult {
  bookingId: string;
  journeyId: string;
}

/**
 * Create the journey and put the booking in service (the −2h en-route step).
 * The journey row is unique per booking, so a replayed dispatch returns the
 * existing journey instead of creating a second.
 */
export async function dispatchJourney(
  tenantId: string,
  bookingId: string,
): Promise<DispatchResult | null> {
  return withTenant(tenantId, async (client) => {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM journeys WHERE booking_id = $1`,
      [bookingId],
    );
    if (existing.rows[0]) {
      return { bookingId, journeyId: existing.rows[0].id };
    }

    const res = await client.query<{ vehicle_id: string | null; staff_id: string | null }>(
      `SELECT
         (SELECT vehicle_id FROM booking_resources
           WHERE booking_id = $1 AND resource_type = 'vehicle' AND NOT is_backup LIMIT 1) AS vehicle_id,
         (SELECT staff_id FROM booking_resources
           WHERE booking_id = $1 AND resource_type = 'chauffeur' AND NOT is_backup LIMIT 1) AS staff_id`,
      [bookingId],
    );
    const assigned = res.rows[0];
    if (!assigned?.vehicle_id || !assigned.staff_id) return null;

    const journey = await client.query<{ id: string }>(
      `INSERT INTO journeys (tenant_id, booking_id, vehicle_id, staff_id, dispatched_at)
       VALUES ($1,$2,$3,$4, now())
       RETURNING id`,
      [tenantId, bookingId, assigned.vehicle_id, assigned.staff_id],
    );
    const journeyId = journey.rows[0]!.id;

    await client.query(
      `UPDATE bookings SET status = 'in_service', updated_at = now() WHERE id = $1`,
      [bookingId],
    );
    await recordEvent(client, tenantId, {
      name: 'journey/dispatched',
      data: { bookingId, journeyId },
    });
    return { bookingId, journeyId };
  });
}

/** service_types code → journey_variant enum. */
const SERVICE_TO_VARIANT: Record<string, string> = {
  wedding: 'wedding',
  prom: 'prom',
  airport_transfer: 'transfer',
  corporate: 'corporate',
  celebration: 'celebration',
};

export type CompleteResult =
  | { status: 'completed'; bookingId: string; customerId: string; variant: string }
  | { status: 'already_completed'; bookingId: string }
  | { status: 'not_found' };

/**
 * Complete a booking after the service has run: close the journey, mark the
 * booking completed, and emit booking/completed (which drives the review request
 * and any post-service nurture). Idempotent.
 */
export async function completeBooking(
  tenantId: string,
  bookingId: string,
): Promise<CompleteResult> {
  return withTenant(tenantId, async (client) => {
    const b = await client.query<{ status: string; customer_id: string; service_type: string }>(
      `SELECT status, customer_id, service_type FROM bookings WHERE id = $1`,
      [bookingId],
    );
    const booking = b.rows[0];
    if (!booking) return { status: 'not_found' };
    if (booking.status === 'completed') {
      return { status: 'already_completed', bookingId };
    }

    await client.query(
      `UPDATE bookings SET status = 'completed', updated_at = now() WHERE id = $1`,
      [bookingId],
    );
    await client.query(
      `UPDATE journeys SET completed_at = COALESCE(completed_at, now()) WHERE booking_id = $1`,
      [bookingId],
    );

    const variant = SERVICE_TO_VARIANT[booking.service_type] ?? booking.service_type;
    await recordEvent(client, tenantId, {
      name: 'booking/completed',
      data: { bookingId, customerId: booking.customer_id, variant },
    });
    return { status: 'completed', bookingId, customerId: booking.customer_id, variant };
  });
}
