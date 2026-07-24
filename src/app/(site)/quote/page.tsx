import type { Metadata } from 'next';
import { QuoteEngine } from '@/components/QuoteEngine';

// The quote flow is a conversion surface, not an indexable page (spec §6.1).
export const metadata: Metadata = {
  title: 'Get a quote',
  robots: { index: false, follow: true },
};

export default function QuotePage() {
  return (
    <main className="px-6 py-12">
      <QuoteEngine />
    </main>
  );
}
