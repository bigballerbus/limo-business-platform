import { SITE } from '@/config/site';
import { localBusinessSchema, type JsonLd } from '@/lib/domain/seo/jsonld';

/**
 * The site-wide LocalBusiness entity, assembled from static brand config.
 *
 * Fields that depend on the client (licence number, phone, verified review
 * counts — OI-4/OI-10) are omitted until confirmed rather than faked; the
 * builder emits valid schema either way. Area served reflects the launch
 * footprint (OI-8) and moves to CMS-managed data in the reference-entity
 * transition.
 */
export function siteBusinessSchema(): JsonLd {
  return localBusinessSchema({
    name: SITE.brand,
    url: SITE.url,
    priceRange: '££££',
    address: {
      addressLocality: 'Maidstone',
      addressRegion: 'Kent',
      addressCountry: 'GB',
    },
    areaServed: ['Kent', 'South East London', 'South Essex'],
  });
}
