# Kent Limousines — Luxury Ground Transport Platform

A production web platform for **Kent Limousines** (`kentlimousines.co.uk`), a UK licensed private hire operator serving Kent, South East London and South Essex, architected to scale nationwide and to franchise.

Three surfaces, one codebase:

- **Public website** — 1,000+ programmatically-generated SEO pages, an instant quote engine, and a booking/deposit flow.
- **Admin (CMS + CRM)** — Payload content management with a publish-time proof gate, plus the operational CRM: enquiries, quotes, bookings, dispatch, durable automations.
- **Customer / partner portals** — booking history, rebooking, corporate accounts (phase 2).

## Project status

🟢 **Sprint 10 — Never-forgotten-lead sweep complete** (BC9: dead-letter queue with tenant RLS; pure Needs-Attention classification; `findNeedsAttention` dashboard query — overdue leads, stalled deposits, open dead-letters ranked by urgency; `sweepOrphans` re-drives overdue leads; hourly Inngest cron; secret-guarded data endpoint). Next: Sprint 11 (nurture workflows, reviews, referrals). Note: full town/venue/route page population and CMS reference-entity transition still depend on OI-8; the rich in-admin dashboard UI binds in Sprint 12.

- Setup & workflows: **[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)**
- Agreed decisions: **[`docs/DECISIONS.md`](docs/DECISIONS.md)** (the living decision record; with the spec, the single source of truth).
- Canonical specification: **[`docs/specification/`](docs/specification/)** (Technical Implementation Specification v1.0).

The full analysis and build plan is in **[`docs/PHASE-1-DISCOVERY.md`](docs/PHASE-1-DISCOVERY.md)**:

- Confirmed understanding of the specification and the ten business constraints (BC1–BC10).
- Findings — contradictions, ambiguities, and gaps, each with a recommended resolution.
- Recommended improvements (no technology is being swapped).
- Open items requiring business input, including the hard blockers for the pricing engine.
- The development plan — six milestones, dependency graph, and critical path.
- Quality gates, the launch Definition of Done, and top risks.

## Intended technology stack (per specification)

TypeScript (strict) · Next.js 15 App Router · React 19 · Tailwind 4 · Payload CMS 3 · PostgreSQL 16 + PostGIS on Neon · Drizzle · Inngest (durable workflows) · Typesense · Upstash Redis · Vercel · Cloudflare (WAF/CDN/R2) · Resend · Twilio · WhatsApp Cloud API · Stripe · Sentry · Auth.js v5 · Vitest / Playwright / axe-core · GitHub Actions.

The three architectural decisions that drive everything: **durable workflow execution (Inngest)**, **geospatial pricing (PostGIS)**, and **multi-tenancy from day one (Row-Level Security)**.
