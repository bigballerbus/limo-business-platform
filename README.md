# Luxury Ground Transport Platform

A production web platform for a UK licensed private hire operator (Kent, South East London, South Essex), architected to scale nationwide and to franchise.

Three surfaces, one codebase:

- **Public website** — 1,000+ programmatically-generated SEO pages, an instant quote engine, and a booking/deposit flow.
- **Admin (CMS + CRM)** — Payload content management with a publish-time proof gate, plus the operational CRM: enquiries, quotes, bookings, dispatch, durable automations.
- **Customer / partner portals** — booking history, rebooking, corporate accounts (phase 2).

## Project status

🟡 **Phase 1 — Discovery complete. Awaiting approval before any application code is written.**

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
