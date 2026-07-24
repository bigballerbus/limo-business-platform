import type { MetadataRoute } from 'next';
import { SITE } from '@/config/site';
import { SERVICE_SLUGS } from '@/config/services';
import { buildSitemapEntries, type SitemapPage } from '@/lib/domain/seo/sitemap';

/**
 * XML sitemap (spec §7). Built from the SEO engine's typed page list, priorities
 * and change frequencies applied per segment. Today it enumerates the core and
 * service pages; the reference-entity transition adds venues/towns/routes from
 * CMS-managed data through the same builder, so the tail scales without touching
 * this file's shape.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const pages: SitemapPage[] = [
    { path: '/', segment: 'core' },
    { path: '/quote', segment: 'core', priority: 0.9 },
    ...SERVICE_SLUGS.map((slug): SitemapPage => ({
      path: `/services/${slug}`,
      segment: 'services',
    })),
  ];

  return buildSitemapEntries(pages, SITE.url).map((entry) => ({
    url: entry.url,
    lastModified: entry.lastModified,
    changeFrequency: entry.changeFrequency,
    priority: entry.priority,
  }));
}
