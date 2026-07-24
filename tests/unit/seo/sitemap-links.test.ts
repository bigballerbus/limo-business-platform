import { describe, expect, it } from 'vitest';
import { bySegment, buildSitemapEntries, type SitemapPage } from '@/lib/domain/seo/sitemap';
import { findOrphans, relatedLinks, type LinkableEntity } from '@/lib/domain/seo/internalLinks';

describe('buildSitemapEntries', () => {
  const pages: SitemapPage[] = [
    { path: '/', segment: 'core' },
    { path: '/services/weddings', segment: 'services' },
    { path: '/venues/leeds-castle', segment: 'venues' },
  ];

  it('builds absolute URLs and applies per-segment defaults', () => {
    const entries = buildSitemapEntries(pages, 'https://kentlimousines.co.uk');
    expect(entries[0]).toMatchObject({
      url: 'https://kentlimousines.co.uk/',
      priority: 1.0,
      changeFrequency: 'weekly',
    });
    expect(entries[1]!.priority).toBe(0.9);
    expect(entries[2]!.priority).toBe(0.8);
  });

  it('groups pages by segment', () => {
    const grouped = bySegment(pages);
    expect(grouped.core).toHaveLength(1);
    expect(grouped.venues).toHaveLength(1);
  });
});

describe('relatedLinks', () => {
  const entities: LinkableEntity[] = [
    {
      path: '/venues/leeds-castle',
      title: 'Leeds Castle',
      facets: { area: 'maidstone', service: 'wedding' },
    },
    {
      path: '/venues/hever-castle',
      title: 'Hever Castle',
      facets: { area: 'maidstone', service: 'wedding' },
    },
    {
      path: '/venues/the-shard',
      title: 'The Shard',
      facets: { area: 'london', service: 'corporate' },
    },
  ];

  it('ranks by shared facets and excludes the current page', () => {
    const links = relatedLinks(entities[0]!, entities);
    expect(links.map((l) => l.path)).not.toContain('/venues/leeds-castle');
    expect(links[0]!.path).toBe('/venues/hever-castle'); // two shared facets
  });

  it('drops candidates with no shared facet', () => {
    const links = relatedLinks(entities[0]!, entities);
    expect(links.map((l) => l.path)).not.toContain('/venues/the-shard');
  });

  it('reports no orphans when every page shares a facet with another', () => {
    const connected: LinkableEntity[] = [
      { path: '/a', title: 'A', facets: { s: 'x' } },
      { path: '/b', title: 'B', facets: { s: 'x' } },
    ];
    expect(findOrphans(connected)).toEqual([]);
  });

  it('flags an orphan that shares no facet with anything', () => {
    const withOrphan: LinkableEntity[] = [
      { path: '/a', title: 'A', facets: { s: 'x' } },
      { path: '/b', title: 'B', facets: { s: 'x' } },
      { path: '/lonely', title: 'Lonely', facets: { s: 'z' } },
    ];
    expect(findOrphans(withOrphan)).toEqual(['/lonely']);
  });
});
