/**
 * Programmatic JSON-LD builders (spec §7) — pure logic.
 *
 * Every public template renders structured data built here. The builders take
 * typed inputs and return plain, serialisable objects (no framework, no IO), so
 * they are unit-tested for shape and validity and reused across all page types.
 * Emitting valid schema on every template is a launch gate (§7 SEO), so the
 * shape is pinned by tests rather than hand-written per page.
 */

export type JsonLd = Record<string, unknown>;

const SCHEMA_CONTEXT = 'https://schema.org';

export interface PostalAddress {
  streetAddress?: string;
  addressLocality: string;
  addressRegion: string;
  postalCode?: string;
  addressCountry: string;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface LocalBusinessInput {
  name: string;
  url: string;
  telephone?: string;
  priceRange?: string;
  image?: string;
  address: PostalAddress;
  geo?: GeoPoint;
  areaServed?: string[];
  sameAs?: string[];
  aggregateRating?: AggregateRatingInput;
}

/**
 * LocalBusiness (the site-wide entity). `LimousineService` is the most specific
 * schema.org type for chauffeured hire; falling back to LocalBusiness fields
 * keeps it valid everywhere the richer type is not recognised.
 */
export function localBusinessSchema(input: LocalBusinessInput): JsonLd {
  const schema: JsonLd = {
    '@context': SCHEMA_CONTEXT,
    '@type': ['LimousineService', 'LocalBusiness'],
    name: input.name,
    url: input.url,
    address: postalAddress(input.address),
  };
  if (input.telephone) schema.telephone = input.telephone;
  if (input.priceRange) schema.priceRange = input.priceRange;
  if (input.image) schema.image = input.image;
  if (input.geo) {
    schema.geo = {
      '@type': 'GeoCoordinates',
      latitude: input.geo.latitude,
      longitude: input.geo.longitude,
    };
  }
  if (input.areaServed?.length) {
    schema.areaServed = input.areaServed.map((name) => ({ '@type': 'AdministrativeArea', name }));
  }
  if (input.sameAs?.length) schema.sameAs = input.sameAs;
  if (input.aggregateRating) schema.aggregateRating = aggregateRatingSchema(input.aggregateRating);
  return schema;
}

export interface ServiceSchemaInput {
  name: string;
  description: string;
  url: string;
  providerName: string;
  providerUrl: string;
  areaServed?: string[];
  serviceType?: string;
}

export function serviceSchema(input: ServiceSchemaInput): JsonLd {
  const schema: JsonLd = {
    '@context': SCHEMA_CONTEXT,
    '@type': 'Service',
    name: input.name,
    description: input.description,
    url: input.url,
    provider: { '@type': 'LocalBusiness', name: input.providerName, url: input.providerUrl },
  };
  if (input.serviceType) schema.serviceType = input.serviceType;
  if (input.areaServed?.length) {
    schema.areaServed = input.areaServed.map((name) => ({ '@type': 'AdministrativeArea', name }));
  }
  return schema;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export function faqPageSchema(items: readonly FaqItem[]): JsonLd {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  };
}

export interface Breadcrumb {
  name: string;
  url: string;
}

export function breadcrumbSchema(crumbs: readonly Breadcrumb[]): JsonLd {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

export interface AggregateRatingInput {
  ratingValue: number;
  reviewCount: number;
  bestRating?: number;
}

export function aggregateRatingSchema(input: AggregateRatingInput): JsonLd {
  return {
    '@type': 'AggregateRating',
    ratingValue: input.ratingValue,
    reviewCount: input.reviewCount,
    bestRating: input.bestRating ?? 5,
  };
}

export interface WebPageInput {
  name: string;
  description: string;
  url: string;
  primaryImage?: string;
}

export function webPageSchema(input: WebPageInput): JsonLd {
  const schema: JsonLd = {
    '@context': SCHEMA_CONTEXT,
    '@type': 'WebPage',
    name: input.name,
    description: input.description,
    url: input.url,
  };
  if (input.primaryImage) schema.primaryImageOfPage = input.primaryImage;
  return schema;
}

function postalAddress(address: PostalAddress): JsonLd {
  const schema: JsonLd = {
    '@type': 'PostalAddress',
    addressLocality: address.addressLocality,
    addressRegion: address.addressRegion,
    addressCountry: address.addressCountry,
  };
  if (address.streetAddress) schema.streetAddress = address.streetAddress;
  if (address.postalCode) schema.postalCode = address.postalCode;
  return schema;
}
