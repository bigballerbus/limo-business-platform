import type { MetadataRoute } from 'next';
import { SITE } from '@/config/site';

/**
 * robots.txt (spec §7). Everything indexable except the Payload admin, the
 * transactional API surface and the thank-you/thin pages; the sitemap is
 * advertised so crawlers discover the full page set.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/'],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
