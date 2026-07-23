import type { Metadata, Viewport } from 'next';
import { SITE } from '@/config/site';
import '@/styles/globals.css';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
