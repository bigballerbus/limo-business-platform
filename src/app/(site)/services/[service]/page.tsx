import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SITE } from '@/config/site';
import { SERVICES, SERVICE_SLUGS } from '@/config/services';
import { JsonLd } from '@/components/JsonLd';
import { siteBusinessSchema } from '@/lib/seo/business';
import { breadcrumbSchema, faqPageSchema, serviceSchema } from '@/lib/domain/seo/jsonld';
import { buildMetadata } from '@/lib/domain/seo/metadata';
import { relatedLinks, type LinkableEntity } from '@/lib/domain/seo/internalLinks';

/**
 * Service hub template (spec §6). One component renders all service pages via
 * `generateStaticParams` — the known slugs are pre-rendered at build; anything
 * else `notFound()`s so the dynamic segment can never become a soft-404 farm
 * (Phase-1 finding F14). Structured data (Service, Breadcrumb, FAQ) and the
 * canonical/OG metadata are built by the shared SEO engine. ISR keeps the tail
 * fresh once content is CMS-managed.
 */
export const dynamicParams = false;
export const revalidate = 3600;

export function generateStaticParams() {
  return SERVICE_SLUGS.map((service) => ({ service }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ service: string }>;
}): Promise<Metadata> {
  const { service: slug } = await params;
  const service = SERVICES[slug];
  if (!service) return {};
  const meta = buildMetadata({
    title: `${service.name} in Kent`,
    description: service.metaDescription,
    path: `/services/${service.slug}`,
    baseUrl: SITE.url,
    brand: SITE.brand,
    locale: SITE.locale,
  });
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: meta.canonical },
    robots: meta.robots,
    openGraph: {
      title: meta.openGraph.title,
      description: meta.openGraph.description,
      url: meta.openGraph.url,
      type: meta.openGraph.type,
      locale: meta.openGraph.locale,
      siteName: meta.openGraph.siteName,
    },
  };
}

function serviceEntities(): LinkableEntity[] {
  return SERVICE_SLUGS.map((slug) => ({
    path: `/services/${slug}`,
    title: SERVICES[slug]!.name,
    facets: { kind: 'service' },
  }));
}

export default async function ServicePage({ params }: { params: Promise<{ service: string }> }) {
  const { service: slug } = await params;
  const service = SERVICES[slug];
  if (!service) notFound();

  const url = `${SITE.url}/services/${service.slug}`;
  const related = relatedLinks(
    { path: `/services/${service.slug}`, title: service.name, facets: { kind: 'service' } },
    serviceEntities(),
  );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-12 px-6 py-16">
      <JsonLd
        schema={[
          siteBusinessSchema(),
          serviceSchema({
            name: service.name,
            description: service.metaDescription,
            url,
            providerName: SITE.brand,
            providerUrl: SITE.url,
            areaServed: ['Kent', 'South East London', 'South Essex'],
            serviceType: service.name,
          }),
          breadcrumbSchema([
            { name: 'Home', url: `${SITE.url}/` },
            { name: 'Services', url: `${SITE.url}/services` },
            { name: service.name, url },
          ]),
          faqPageSchema(service.faqs),
        ]}
      />

      <nav aria-label="Breadcrumb" className="text-sm text-[var(--color-ink-muted)]">
        <Link href="/">Home</Link> <span aria-hidden>/</span> {service.name}
      </nav>

      <header className="flex flex-col gap-4">
        <h1 className="font-serif text-4xl leading-tight text-balance">{service.h1}</h1>
        <p className="text-lg text-[var(--color-ink-muted)]">{service.intro}</p>
        <div>
          <Link
            href="/quote"
            className="inline-block rounded-md bg-[var(--color-ink)] px-6 py-3 font-medium text-[var(--color-surface)]"
          >
            Get an instant quote
          </Link>
        </div>
      </header>

      {service.faqs.length > 0 && (
        <section aria-labelledby="faq-heading" className="flex flex-col gap-4">
          <h2 id="faq-heading" className="font-serif text-2xl">
            {service.name} — frequently asked
          </h2>
          <dl className="flex flex-col gap-4">
            {service.faqs.map((faq) => (
              <div key={faq.question}>
                <dt className="font-medium">{faq.question}</dt>
                <dd className="text-[var(--color-ink-muted)]">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {related.length > 0 && (
        <section aria-labelledby="related-heading" className="flex flex-col gap-3">
          <h2 id="related-heading" className="font-serif text-2xl">
            Other services
          </h2>
          <ul className="flex flex-wrap gap-3">
            {related.map((link) => (
              <li key={link.path}>
                <Link
                  href={link.path}
                  className="inline-block rounded-md border border-[var(--color-line)] px-4 py-2 hover:bg-[var(--color-surface-raised)]"
                >
                  {link.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
