import { z } from 'zod';

/**
 * The single quote-submission schema, shared between the client (for UX
 * validation) and the server (which re-validates because the client is
 * untrusted — spec §8.4). One definition, no drift.
 */

export const SERVICE_TYPES = [
  'wedding',
  'prom',
  'airport_transfer',
  'corporate',
  'celebration',
] as const;
export const VEHICLE_TIERS = [
  'saloon',
  'mpv',
  'stretch_limo',
  'wedding_car',
  'accessible',
] as const;
export const ADDON_KEYS = [
  'red_carpet',
  'champagne',
  'extra_hour',
  'extra_stop',
  'decorations',
] as const;

/** UK postcode (loose but structural). Normalised to uppercase. */
const ukPostcode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/, 'Enter a valid UK postcode');

/** Weddings may book further out than other occasions (decision T-004). */
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export const QuoteSubmissionSchema = z
  .object({
    occasion: z.enum(SERVICE_TYPES),
    eventDate: z.coerce.date(),
    pickupPostcode: ukPostcode,
    destinationType: z.enum(['postcode', 'venue', 'return']),
    destinationPostcode: ukPostcode.optional(),
    venueId: z.string().uuid().optional(),
    passengerCount: z.number().int().min(1).max(16),
    durationHours: z.number().positive().max(24),
    vehicleTier: z.enum(VEHICLE_TIERS),
    addons: z.array(z.enum(ADDON_KEYS)).default([]),
    hasMinors: z.boolean().default(false),
    contact: z.object({
      firstName: z.string().trim().min(1).max(80),
      lastName: z.string().trim().min(1).max(80),
      email: z.string().trim().toLowerCase().email(),
      mobile: z.string().trim().min(7).max(20),
      marketingConsent: z.boolean().default(false),
    }),
    attribution: z.object({
      firstTouch: z.string().min(1),
      lastTouch: z.string().min(1),
    }),
    statedSource: z.string().optional(),
    // BC2 — captured when minors travel; verification happens before deposit.
    parentGuardian: z
      .object({
        firstName: z.string().trim().min(1).max(80),
        lastName: z.string().trim().min(1).max(80),
        email: z.string().trim().toLowerCase().email(),
        mobile: z.string().trim().min(7).max(20),
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    const now = Date.now();
    const event = data.eventDate.getTime();
    if (event < now - MONTH_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['eventDate'],
        message: 'Event date cannot be in the past',
      });
    }
    const horizonMonths = data.occasion === 'wedding' ? 36 : 24;
    if (event > now + horizonMonths * MONTH_MS) {
      ctx.addIssue({
        code: 'custom',
        path: ['eventDate'],
        message: `We can quote up to ${horizonMonths} months ahead for this occasion`,
      });
    }
    if (data.destinationType === 'postcode' && !data.destinationPostcode) {
      ctx.addIssue({
        code: 'custom',
        path: ['destinationPostcode'],
        message: 'Destination postcode is required',
      });
    }
    if (data.destinationType === 'venue' && !data.venueId) {
      ctx.addIssue({ code: 'custom', path: ['venueId'], message: 'Select a venue' });
    }
    if (data.hasMinors && !data.parentGuardian) {
      ctx.addIssue({
        code: 'custom',
        path: ['parentGuardian'],
        message: 'A parent or guardian must be provided when under-18s are travelling',
      });
    }
  });

export type QuoteSubmission = z.infer<typeof QuoteSubmissionSchema>;
