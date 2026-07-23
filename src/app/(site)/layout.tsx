import type { Metadata, Viewport } from 'next';
import { SITE } from '@/config/site';
import '@/styles/globals.css';

/**
 * Root layout for the public site route group.
 *
 * The app uses multiple root layouts (Next.js route groups): this one owns the
 * public site's `<html>`, while the Payload admin group owns its own. This is
 * the standard Payload 3 + Next integration and is why there is no shared
 * `src/app/layout.tsx`.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.brand} — Luxury Chauffeur & Limousine Hire`,
    template: `%s | ${SITE.brand}`,
  },
  description: SITE.description,
  openGraph: {
    type: 'website',
    locale: SITE.locale,
    siteName: SITE.brand,
    url: SITE.url,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#14110f' },
  ],
};

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
