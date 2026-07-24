import { describe, expect, it } from 'vitest';
import {
  aggregateRatingSchema,
  breadcrumbSchema,
  faqPageSchema,
  localBusinessSchema,
  serviceSchema,
  webPageSchema,
} from '@/lib/domain/seo/jsonld';

describe('localBusinessSchema', () => {
  it('emits a valid LimousineService/LocalBusiness node', () => {
    const s = localBusinessSchema({
      name: 'Kent Limousines',
      url: 'https://kentlimousines.co.uk',
      address: { addressLocality: 'Maidstone', addressRegion: 'Kent', addressCountry: 'GB' },
      areaServed: ['Kent'],
    });
    expect(s['@context']).toBe('https://schema.org');
    expect(s['@type']).toEqual(['LimousineService', 'LocalBusiness']);
    expect((s.address as Record<string, unknown>)['@type']).toBe('PostalAddress');
    expect(s.areaServed).toEqual([{ '@type': 'AdministrativeArea', name: 'Kent' }]);
  });

  it('omits optional fields cleanly and embeds an aggregate rating', () => {
    const s = localBusinessSchema({
      name: 'Kent Limousines',
      url: 'https://kentlimousines.co.uk',
      address: { addressLocality: 'Maidstone', addressRegion: 'Kent', addressCountry: 'GB' },
      aggregateRating: { ratingValue: 4.9, reviewCount: 120 },
    });
    expect(s.telephone).toBeUndefined();
    expect((s.aggregateRating as Record<string, unknown>).reviewCount).toBe(120);
  });
});

describe('serviceSchema', () => {
  it('names the provider and area served', () => {
    const s = serviceSchema({
      name: 'Wedding Car Hire',
      description: 'Luxury wedding cars.',
      url: 'https://kentlimousines.co.uk/services/weddings',
      providerName: 'Kent Limousines',
      providerUrl: 'https://kentlimousines.co.uk',
      areaServed: ['Kent'],
    });
    expect(s['@type']).toBe('Service');
    expect((s.provider as Record<string, unknown>).name).toBe('Kent Limousines');
  });
});

describe('faqPageSchema', () => {
  it('maps items to Question/Answer nodes', () => {
    const s = faqPageSchema([{ question: 'Q?', answer: 'A.' }]);
    expect(s['@type']).toBe('FAQPage');
    const entity = (s.mainEntity as Record<string, unknown>[])[0]!;
    expect(entity['@type']).toBe('Question');
    expect((entity.acceptedAnswer as Record<string, unknown>).text).toBe('A.');
  });
});

describe('breadcrumbSchema', () => {
  it('numbers positions from 1', () => {
    const s = breadcrumbSchema([
      { name: 'Home', url: 'https://x/' },
      { name: 'Services', url: 'https://x/services' },
    ]);
    const items = s.itemListElement as Record<string, unknown>[];
    expect(items.map((i) => i.position)).toEqual([1, 2]);
  });
});

describe('aggregateRatingSchema + webPageSchema', () => {
  it('defaults bestRating to 5', () => {
    expect(aggregateRatingSchema({ ratingValue: 4.8, reviewCount: 10 }).bestRating).toBe(5);
  });
  it('includes the primary image when provided', () => {
    const s = webPageSchema({ name: 'n', description: 'd', url: 'u', primaryImage: 'img' });
    expect(s.primaryImageOfPage).toBe('img');
  });
});
