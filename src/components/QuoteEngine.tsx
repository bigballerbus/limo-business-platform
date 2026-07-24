'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ADDON_KEYS,
  QuoteSubmissionSchema,
  SERVICE_TYPES,
  VEHICLE_TIERS,
  type QuoteSubmission,
} from '@/lib/schemas/quote';
import { formatGBP } from '@/lib/domain/pricing/money';
import { submitQuote } from '@/app/(site)/quote/actions';
import type { QuoteActionResult } from '@/app/(site)/quote/types';

const OCCASION_LABEL: Record<(typeof SERVICE_TYPES)[number], string> = {
  wedding: 'Wedding',
  prom: 'Prom',
  airport_transfer: 'Airport transfer',
  corporate: 'Corporate',
  celebration: 'Celebration',
};
const TIER_LABEL: Record<(typeof VEHICLE_TIERS)[number], string> = {
  saloon: 'Executive saloon',
  mpv: 'Executive MPV',
  stretch_limo: 'Stretch limousine',
  wedding_car: 'Wedding car',
  accessible: 'Wheelchair accessible',
};
const ADDON_LABEL: Record<(typeof ADDON_KEYS)[number], string> = {
  red_carpet: 'Red carpet',
  champagne: 'Champagne',
  extra_hour: 'Extra hour',
  extra_stop: 'Extra stop',
  decorations: 'Decorations',
};
const HUMAN_MESSAGE: Record<Extract<QuoteActionResult, { status: 'human' }>['reason'], string> = {
  multi_vehicle:
    'For 9 or more passengers we arrange multiple vehicles — a coordinator will call you shortly.',
  below_floor: 'Let us price this one properly — a coordinator will be in touch within minutes.',
  geocode_unavailable:
    "We couldn't check that postcode automatically — a coordinator will confirm your price shortly.",
  minors:
    'Because the booking involves under-18s, a parent or guardian will need to confirm the details.',
};

export function QuoteEngine() {
  const [result, setResult] = useState<QuoteActionResult | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<QuoteSubmission>({
    resolver: zodResolver(QuoteSubmissionSchema),
    defaultValues: {
      occasion: 'wedding',
      destinationType: 'return',
      passengerCount: 2,
      durationHours: 3,
      vehicleTier: 'saloon',
      addons: [],
      hasMinors: false,
      attribution: { firstTouch: 'website', lastTouch: 'website' },
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setResult(await submitQuote(data));
  });

  return (
    <form onSubmit={onSubmit} className="mx-auto grid max-w-2xl gap-6" noValidate>
      <fieldset className="grid gap-4">
        <legend className="font-serif text-2xl">Get an instant quote</legend>

        <label className="grid gap-1">
          <span>Occasion</span>
          <select
            {...register('occasion')}
            className="rounded border border-[var(--color-line)] p-2"
          >
            {SERVICE_TYPES.map((s) => (
              <option key={s} value={s}>
                {OCCASION_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1">
          <span>Event date</span>
          <input
            type="date"
            {...register('eventDate')}
            className="rounded border border-[var(--color-line)] p-2"
          />
          {errors.eventDate && (
            <span role="alert" className="text-[var(--color-danger)]">
              {errors.eventDate.message}
            </span>
          )}
        </label>

        <label className="grid gap-1">
          <span>Pickup postcode</span>
          <input
            {...register('pickupPostcode')}
            autoComplete="postal-code"
            className="rounded border border-[var(--color-line)] p-2"
          />
          {errors.pickupPostcode && (
            <span role="alert" className="text-[var(--color-danger)]">
              {errors.pickupPostcode.message}
            </span>
          )}
        </label>

        <label className="grid gap-1">
          <span>Journey</span>
          <select
            {...register('destinationType')}
            className="rounded border border-[var(--color-line)] p-2"
          >
            <option value="return">Return journey</option>
            <option value="postcode">One way to a postcode</option>
            <option value="venue">To a venue</option>
          </select>
        </label>

        <label className="grid gap-1">
          <span>Destination postcode (if one way)</span>
          <input
            {...register('destinationPostcode')}
            autoComplete="postal-code"
            className="rounded border border-[var(--color-line)] p-2"
          />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-1">
            <span>Passengers</span>
            <input
              type="number"
              min={1}
              max={16}
              {...register('passengerCount', { valueAsNumber: true })}
              className="rounded border border-[var(--color-line)] p-2"
            />
          </label>
          <label className="grid gap-1">
            <span>Hours</span>
            <input
              type="number"
              min={1}
              max={24}
              step={0.5}
              {...register('durationHours', { valueAsNumber: true })}
              className="rounded border border-[var(--color-line)] p-2"
            />
          </label>
        </div>

        <label className="grid gap-1">
          <span>Vehicle</span>
          <select
            {...register('vehicleTier')}
            className="rounded border border-[var(--color-line)] p-2"
          >
            {VEHICLE_TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="grid gap-2">
          <legend>Add-ons</legend>
          {ADDON_KEYS.map((a) => (
            <label key={a} className="flex items-center gap-2">
              <input type="checkbox" value={a} {...register('addons')} />
              <span>{ADDON_LABEL[a]}</span>
            </label>
          ))}
        </fieldset>

        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('hasMinors')} />
          <span>This booking carries passengers under 18</span>
        </label>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="font-serif text-2xl">Your details</legend>
        <div className="grid grid-cols-2 gap-4">
          <label className="grid gap-1">
            <span>First name</span>
            <input
              {...register('contact.firstName')}
              autoComplete="given-name"
              className="rounded border border-[var(--color-line)] p-2"
            />
          </label>
          <label className="grid gap-1">
            <span>Last name</span>
            <input
              {...register('contact.lastName')}
              autoComplete="family-name"
              className="rounded border border-[var(--color-line)] p-2"
            />
          </label>
        </div>
        <label className="grid gap-1">
          <span>Email</span>
          <input
            type="email"
            {...register('contact.email')}
            autoComplete="email"
            className="rounded border border-[var(--color-line)] p-2"
          />
          {errors.contact?.email && (
            <span role="alert" className="text-[var(--color-danger)]">
              {errors.contact.email.message}
            </span>
          )}
        </label>
        <label className="grid gap-1">
          <span>Mobile</span>
          <input
            type="tel"
            {...register('contact.mobile')}
            autoComplete="tel"
            className="rounded border border-[var(--color-line)] p-2"
          />
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register('contact.marketingConsent')} />
          <span>Keep me updated with offers (optional)</span>
        </label>
      </fieldset>

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-[var(--color-ink)] px-6 py-3 font-medium text-[var(--color-surface)] disabled:opacity-60"
      >
        {isSubmitting ? 'Calculating…' : 'Get my price'}
      </button>

      <output aria-live="polite" className="min-h-6">
        {result?.status === 'ok' && (
          <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-4">
            <p className="text-lg font-medium">
              {result.confidence === 'exact'
                ? formatGBP(result.totalPence)
                : `${formatGBP(result.rangeLowPence ?? result.totalPence)} – ${formatGBP(result.rangeHighPence ?? result.totalPence)}`}
            </p>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Reference {result.reference}. A coordinator will confirm shortly.
            </p>
          </div>
        )}
        {result?.status === 'human' && (
          <p className="rounded-md border border-[var(--color-line)] p-4">
            {HUMAN_MESSAGE[result.reason]}
          </p>
        )}
        {result?.status === 'error' && (
          <p role="alert" className="text-[var(--color-danger)]">
            Please check the highlighted fields and try again.
          </p>
        )}
      </output>
    </form>
  );
}
