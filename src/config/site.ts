/**
 * Static, non-secret site configuration.
 *
 * Business facts that vary per environment (licence numbers, phone) or per
 * tenant live in the database; this file holds only the brand-level constants
 * the framework needs before a request is scoped to a tenant.
 */
export const SITE = {
  brand: 'Kent Limousines',
  legalName: 'Kent Limousines',
  /** Primary indexable origin. Overridden per-environment via NEXT_PUBLIC_SITE_URL. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://kentlimousines.co.uk',
  locale: 'en_GB',
  description:
    'Chauffeur-driven luxury ground transport across Kent, South East London and South Essex — weddings, proms, airport transfers and corporate travel.',
} as const;

export type SiteConfig = typeof SITE;
