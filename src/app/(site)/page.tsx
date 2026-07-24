import Link from 'next/link';
import { SITE } from '@/config/site';
import { SERVICES, SERVICE_SLUGS } from '@/config/services';
import { JsonLd } from '@/components/JsonLd';
import { siteBusinessSchema } from '@/lib/seo/business';
import { faqPageSchema, webPageSchema } from '@/lib/domain/seo/jsonld';

/**
 * Homepage (spec §6). The site-wide LocalBusiness, a WebPage node and a small
 * FAQ block are emitted as structured data; the service grid is the top of the
 * internal-link graph (every service hub is reachable from here). The primary
 * CTA is the instant quote — the platform's lead-generation core.
 */
const HOME_FAQS = [
  {
    question: 'Which areas do you cover?',
    answer:
      'We serve Kent, South East London and South Essex, including all major airports and wedding venues across the region.',
  },
  {
    question: 'How quickly will I get a price?',
    answer:
      'Instantly. Our online quote gives you a price in seconds, and a coordinator confirms the details shortly after.',
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-16 px-6 py-16">
      <JsonLd
        schema={[
          siteBusinessSchema(),
          webPageSchema({
            name: `${SITE.brand} — Luxury Chauffeur & Limousine Hire`,
            description: SITE.description,
            url: `${SITE.url}/`,
          }),
          faqPageSchema(HOME_FAQS),
        ]}
      />

      <section className="flex flex-col gap-6">
        <p className="text-sm font-medium tracking-widest text-[var(--color-accent)] uppercase">
          {SITE.brand}
        </p>
        <h1 className="font-serif text-4xl leading-tight text-balance sm:text-5xl">
          Luxury chauffeur &amp; limousine hire across Kent, South East London and South Essex.
        </h1>
        <p className="max-w-prose text-lg text-[var(--color-ink-muted)]">
          Weddings, proms, airport transfers and corporate travel — chauffeur-driven, fully
          licensed, and priced in seconds.
        </p>
        <div>
          <Link
            href="/quote"
            className="inline-block rounded-md bg-[var(--color-ink)] px-6 py-3 font-medium text-[var(--color-surface)]"
          >
            Get an instant quote
          </Link>
        </div>
      </section>

      <section aria-labelledby="services-heading" className="flex flex-col gap-6">
        <h2 id="services-heading" className="font-serif text-3xl">
          Our services
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {SERVICE_SLUGS.map((slug) => {
            const service = SERVICES[slug]!;
            return (
              <li key={slug}>
                <Link
                  href={`/services/${slug}`}
                  className="block h-full rounded-md border border-[var(--color-line)] p-5 transition-colors hover:bg-[var(--color-surface-raised)]"
                >
                  <h3 className="font-serif text-xl">{service.name}</h3>
                  <p className="mt-1 text-[var(--color-ink-muted)]">{service.intro}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="faq-heading" className="flex flex-col gap-4">
        <h2 id="faq-heading" className="font-serif text-3xl">
          Frequently asked
        </h2>
        <dl className="flex flex-col gap-4">
          {HOME_FAQS.map((faq) => (
            <div key={faq.question}>
              <dt className="font-medium">{faq.question}</dt>
              <dd className="text-[var(--color-ink-muted)]">{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
