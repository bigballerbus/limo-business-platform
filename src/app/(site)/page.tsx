import { SITE } from '@/config/site';

/**
 * Placeholder homepage — replaced by the real template composition in the
 * page-templates sprint (§6). Present now so the App Router, layout and
 * Tailwind pipeline build and are covered by CI from Sprint 0 onward.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-medium tracking-widest text-[var(--color-accent)] uppercase">
        {SITE.brand}
      </p>
      <h1 className="font-serif text-4xl leading-tight text-balance sm:text-5xl">
        Luxury chauffeur &amp; limousine hire across Kent, South East London and South Essex.
      </h1>
      <p className="max-w-prose text-lg text-[var(--color-ink-muted)]">
        Platform foundation is in place. The instant quote engine, booking flow and content-managed
        pages are delivered in the sprints ahead.
      </p>
    </main>
  );
}
