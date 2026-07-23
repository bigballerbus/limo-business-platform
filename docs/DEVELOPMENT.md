# Development Guide

Engineering handbook for the Kent Limousines platform. See also
[`DECISIONS.md`](DECISIONS.md) (agreed decisions) and
[`PHASE-1-DISCOVERY.md`](PHASE-1-DISCOVERY.md) (the build plan).

## Prerequisites

- **Node 22** (`.nvmrc` → `nvm use`)
- **pnpm 10** (`corepack enable`)
- **Docker** (local Postgres + PostGIS)

## First run

```bash
cp .env.example .env          # then set PAYLOAD_SECRET (openssl rand -base64 48)
pnpm install
pnpm db:up                    # Postgres 16 + PostGIS on :5432
pnpm dev                      # http://localhost:3000  ·  admin at /admin
```

## Scripts

| Script                                     | Purpose                                       |
| ------------------------------------------ | --------------------------------------------- |
| `pnpm dev`                                 | Next dev server (site + Payload admin)        |
| `pnpm build` / `pnpm start`                | Production build / serve                      |
| `pnpm typecheck`                           | `tsc --noEmit` (strict)                       |
| `pnpm lint` / `pnpm lint:fix`              | ESLint (incl. domain boundary)                |
| `pnpm format` / `pnpm format:check`        | Prettier                                      |
| `pnpm test` / `pnpm test:coverage`         | Vitest unit tests (+ coverage gate)           |
| `pnpm test:e2e` / `test:a11y` / `test:seo` | Playwright suites                             |
| `pnpm lhci`                                | Lighthouse budgets (Core Web Vitals)          |
| `pnpm db:up` / `db:down`                   | Local database up/down                        |
| `pnpm generate:types`                      | Regenerate Payload types after schema changes |

## Repository map

```
src/
  app/
    (site)/       # public site — RSC, ISR (owns its <html>)
    (payload)/    # Payload CMS + admin (owns its <html>)
    api/          # route handlers (health, webhooks, …)
  collections/    # Payload collection configs
  components/     # UI components
  config/         # non-secret static config (site brand/url)
  lib/
    domain/       # ⭐ PURE business logic — no framework/db/IO (lint-enforced)
      pricing/    #   pricing engine + zones + money
    env.ts        # Zod-validated environment contract
  styles/         # global CSS + design tokens
tests/
  unit/  e2e/  a11y/  seo/
docs/             # specification, decisions, plan, runbooks
```

There is **no `src/app/layout.tsx`**: the site and Payload route groups each own
a root layout (Next.js multiple root layouts) — this is the standard Payload 3
integration.

## The domain boundary (important)

`src/lib/domain/**` is pure business logic. ESLint forbids it from importing any
framework, database, integration or I/O module. Keep it that way: it is what
makes the pricing engine testable to 100% branch coverage without a database or
network. Impure work belongs in the calling layer, which passes plain data in.

## Quality gates (all block CI)

`format:check` · `lint` · `typecheck` · unit coverage (≥90% on domain) ·
production build · Playwright **e2e/a11y/seo** · **Lighthouse** · secret
(gitleaks) + dependency scan.

**Lighthouse note:** performance score ≥ 0.90, CLS ≤ 0.05, accessibility = 100
and the byte budgets are **hard** gates now. The absolute LCP < 1.8s and TBT run
as **warnings** until the performance milestone (§7.6) lands edge-ISR caching and
critical-CSS inlining, then they flip to hard errors (tracked in DECISIONS T-008).

## Git conventions

- Branch off the default branch; short-lived feature branches; PRs need green CI.
- **Conventional Commits** are enforced by a `commit-msg` hook
  (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:` …).
- A `pre-commit` hook runs lint-staged (ESLint + Prettier on staged files).
- Migrations are **expand/contract only** — never destructive in one deploy.

## Testing layers

- **Unit (Vitest, `*.test.ts`)** — pure domain logic; the bulk of coverage.
- **Integration** — against a Neon branch / local Postgres (from Sprint 1).
- **E2E / A11y / SEO (Playwright, `*.spec.ts`)** — against a production build.
