import { describe, expect, it } from 'vitest';
import { buildMetadata, canonicalUrl } from '@/lib/domain/seo/metadata';

describe('canonicalUrl', () => {
  it('joins path and origin with exactly one slash', () => {
    expect(canonicalUrl('/services/weddings', 'https://kentlimousines.co.uk')).toBe(
      'https://kentlimousines.co.uk/services/weddings',
    );
    expect(canonicalUrl('services/weddings/', 'https://kentlimousines.co.uk/')).toBe(
      'https://kentlimousines.co.uk/services/weddings',
    );
  });

  it('renders the root canonical with a trailing slash', () => {
    expect(canonicalUrl('/', 'https://kentlimousines.co.uk')).toBe('https://kentlimousines.co.uk/');
    expect(canonicalUrl('', 'https://kentlimousines.co.uk')).toBe('https://kentlimousines.co.uk/');
  });
});

describe('buildMetadata', () => {
  const baseInput = {
    title: 'Wedding Car Hire in Kent',
    description: 'Luxury wedding cars.',
    path: '/services/weddings',
    baseUrl: 'https://kentlimousines.co.uk',
    brand: 'Kent Limousines',
    locale: 'en_GB',
  };

  it('builds canonical, OG and indexable robots by default', () => {
    const meta = buildMetadata(baseInput);
    expect(meta.canonical).toBe('https://kentlimousines.co.uk/services/weddings');
    expect(meta.robots).toEqual({ index: true, follow: true });
    expect(meta.openGraph.url).toBe(meta.canonical);
    expect(meta.openGraph.siteName).toBe('Kent Limousines');
  });

  it('marks a page noindex/nofollow when index is false', () => {
    const meta = buildMetadata({ ...baseInput, index: false });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});
