# Phase 1 — Discovery & Development Plan

**Project:** Luxury Ground Transport Platform (UK licensed private hire operator — Kent, South East London, South Essex; architected to scale nationwide and to franchise).
**Source of truth:** _Technical Implementation Specification v1.0_.
**Status:** Discovery complete and **approved**. Agreed decisions are recorded in [`DECISIONS.md`](DECISIONS.md). Awaiting final go-ahead to begin Sprint 0.
**Prepared for:** Managing Director / project sponsor.

---

## 0. Executive summary

This is an unusually strong specification. It is not a wishlist — it is an architecture. It correctly identifies that this business fails or succeeds on three things a naive build would get wrong, and it makes those three decisions load-bearing:

1. **Durable workflow execution (Inngest)** — an 18-month wedding nurture sequence cannot be built on `setTimeout`, cron, or a polled job table. This is the single most under-appreciated requirement and it dictates the whole automation layer.
2. **Geospatial pricing (PostGIS)** — distance-band pricing is a geometry problem, not a postcode lookup table. This dictates PostgreSQL over any document store.
3. **Multi-tenancy from day one (Row-Level Security)** — `tenant_id` on every table now costs almost nothing; retrofitting it into a live system later is a rewrite.

Layered on top are ten hard business constraints (BC1–BC10) that the spec correctly pushes **down into the database** as `CHECK`, `EXCLUDE`, and `NOT NULL` constraints rather than leaving them as application logic that a future bug, admin UI, or stray SQL statement could bypass. That instinct — _enforce in the layer that cannot be circumvented_ — is the defining quality of this design, and we will preserve it rigorously.

**Our recommendation: build the platform substantially as specified.** The technology stack is well-reasoned and internally consistent; we are not proposing to swap any named technology. Our value-add in Phase 1 is a set of **precise corrections and clarifications** where the spec is either internally ambiguous, relies on a Postgres/Payload behaviour that does not work the way the pseudocode implies, or leaves a genuine gap that will bite during Sprint 1 if unresolved. These are listed in §3–§4 with recommended resolutions.

**Two items are hard blockers** (already flagged by the spec's own review): the **real rate card** and the **real cost inputs**. Without them the pricing engine (Sprint 3) and its BC3 margin floor cannot be configured or tested. Everything else can proceed in parallel.

---

## 1. What is being built (confirmed understanding)

**Three surfaces, one Next.js codebase, one database:**

| Surface                        | Purpose                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Public website**             | 1,000+ programmatically-generated SEO pages, an instant quote engine, and a booking/deposit flow.                                                      |
| **Admin (CMS + CRM)**          | Payload-based content management with a publish-time proof gate, plus the operational CRM: enquiries, quotes, bookings, dispatch, durable automations. |
| **Customer / partner portals** | Booking history, rebooking, corporate accounts, supplier self-service (phase 2).                                                                       |

**The ten business constraints (BC1–BC10)** and where each is enforced:

| #    | Constraint                                                              | Enforcement point                                                                     |
| ---- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| BC1  | Vehicles ≤ 8 passengers (9+ is PSV, a different regulatory class)       | DB `CHECK (passenger_capacity BETWEEN 1 AND 8)` + quote-engine hard branch            |
| BC2  | Under-18 bookings require a verified parent/guardian                    | DB `CHECK` on enquiry stage transitions + admin-only release                          |
| BC3  | No quote below 35% contribution margin                                  | Pricing-engine exception **and** `CHECK (contribution_margin_pct >= 35.00)` on quotes |
| BC4  | Weddings require an assigned backup vehicle before the event            | DB `CHECK` + scheduled integrity check + blocking alert                               |
| BC5  | One vehicle / one chauffeur = one booking per time window               | Postgres `EXCLUDE USING gist` on `tstzrange` (not application logic)                  |
| BC6  | Marketing-consent withdrawal must never suppress transactional messages | Two message classes at the send layer; transactional bypasses consent                 |
| BC7  | No non-essential cookie/tag before consent (UK PECR)                    | Consent Mode v2, storage denied by default, gated tag loading                         |
| BC8  | A content page cannot publish without its required proof assets         | Payload `beforeValidate` hook — publish is _blocked_, not warned                      |
| BC9  | Every lead carries a source and a dated next action                     | `NOT NULL` columns + `CHECK` constraint + application validation                      |
| BC10 | Personal-data breach: 72-hour ICO clock                                 | Audit logging + anomaly alerting sufficient to reconstruct scope                      |

**Non-negotiable quality gates:** LCP < 1.8s (mobile, 4G), INP < 150ms, CLS < 0.05, Lighthouse mobile > 90, WCAG 2.2 AA with zero axe violations, > 85% business-logic coverage (100% branch on the pricing engine). **The build fails on** a type error, lint error, performance-budget breach, axe violation, or failing test.

---

## 2. What the specification already gets right (endorsed without change)

We want the record to show these are deliberate, correct choices we are **keeping**:

- **Constraints in the database, not the application.** BC1, BC3, BC5, BC9 as `CHECK`/`EXCLUDE`/`NOT NULL`. This is the right instinct and the reason the platform is trustworthy.
- **The `lib/domain` boundary enforced by lint.** Pure business logic that cannot import a framework, database, or network is logic you can actually test to 100% branch coverage. Keep the lint rule.
- **The event backbone.** Every state change emits a domain event; nothing calls a side-effect directly. New automations subscribe to events instead of editing booking logic. This is the structural decision that keeps the system extensible for years.
- **Model the cost side, not just the price.** The engine computes `estimatedCostPence` and refuses unprofitable quotes. Dead mileage is a first-class field. Most booking systems never know whether a job makes money; this one does.
- **Payload's Local API in-process.** Content queries during render are direct DB calls, not HTTP hops — this is what makes the LCP target achievable at 1,000 pages.
- **Semi-automated Google Business Profile.** Automated GBP posting risks profile suspension, which is existential. Treating GBP as a human-in-the-loop operational process is correct and we will not "improve" it into an automated integration.
- **The zero-`quote_start` revenue-absence alarm.** A silently broken quote engine is the highest-cost, least-noticed failure mode. A revenue-absence alarm is worth more than any uptime check.
- **Neon database branching per PR.** Every preview gets isolated data; every migration is rehearsed before staging.

---

## 3. Findings — contradictions, ambiguities, and gaps

Each finding has a severity, the risk if unresolved, and our recommended resolution. **None of these change the architecture**; they are the precise points a first-pass implementation would get subtly wrong.

### 3.1 Technical corrections (the spec's pseudocode won't behave as written)

| #   | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                                  | Recommended resolution                                                                                                                                                                                                                                                                                                                   |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **High** | **`uuidv7()` is not a built-in function in PostgreSQL 16.** Native `uuidv7()` lands in PG18. Every `DEFAULT uuidv7()` will fail on a stock PG16/Neon instance.                                                                                                                                                                                                                           | Either install the `pg_uuidv7` extension, or generate UUIDv7 in TypeScript (`uuidv7` npm) and pass it in on insert. We recommend **app-side generation** for portability (no extension dependency, works identically in tests) with a DB default as a safety net where the extension is available. Decide in Sprint 1.                   |
| F2  | **High** | **Sitewide-unique `primaryKeyword` cannot be enforced by Payload's `unique: true`.** Payload `unique` is per-collection (one table). The cannibalisation control requires uniqueness across ~10 collections/tables.                                                                                                                                                                      | Introduce a single `page_keywords` table (`tenant_id`, `keyword`, `owner_collection`, `owner_id`, `UNIQUE(tenant_id, keyword)`), written via a shared `afterChange` hook. The cannibalisation guarantee then lives in one DB constraint instead of ten partial ones.                                                                     |
| F3  | **High** | **RLS + Payload + serverless pooling needs explicit wiring.** `USING (tenant_id = current_setting('app.tenant_id')::uuid)` only works if `app.tenant_id` is set on the _same_ pooled connection inside each transaction. Payload/Drizzle will not do this automatically, and a pooled connection can carry a stale setting. Additionally, the app DB role must **not** have `BYPASSRLS`. | Provide a `withTenant(tx, tenantId)` wrapper that issues `SET LOCAL app.tenant_id` at the start of every transaction, route all Payload DB access through a request-scoped context, and provision a dedicated non-superuser, non-`BYPASSRLS` application role. Add an integration test that proves tenant A cannot read tenant B's rows. |
| F4  | Medium   | **`citext` and `btree_gist` are extensions** that must be created in the migration before any table using them. `btree_gist` is called out (good); `citext` (used for `customers.email`) is not.                                                                                                                                                                                         | Add both `CREATE EXTENSION` statements to the first migration, plus `postgis`.                                                                                                                                                                                                                                                           |
| F5  | Medium   | **Native Postgres enums are hard to evolve**, yet §19 plans to extend `service_type` and `vehicle_category`. Values can be added (`ALTER TYPE ... ADD VALUE`) but not removed or reordered, and per-tenant variation is impossible with a global enum.                                                                                                                                   | Keep enums for genuinely-closed regulatory sets (e.g. `resource_type`, `consent_channel`). For the sets the spec explicitly plans to grow (`service_type`, `vehicle_category`), evaluate **lookup tables** in Sprint 1 so franchises can vary them without a type migration. Document the enum-migration playbook either way.            |
| F6  | Medium   | **Cloudflare proxying in front of Vercel** double-caches HTML/images and can fight Vercel's ISR `Cache-Control` and image optimizer. The spec wants Cloudflare WAF/R2 _and_ Vercel ISR.                                                                                                                                                                                                  | Keep Cloudflare for **DNS, WAF, bot management, and R2** (zero-egress asset storage), but serve the app hostname to Vercel **DNS-only (grey cloud)** or carefully coordinate cache headers. Confirm the topology in Sprint 0 before DNS is set — it is painful to change after launch.                                                   |

### 3.2 Specification ambiguities (need a decision, not necessarily code)

| #   | Severity            | Finding                                                                                                                                                                                                                                                                                                                 | Recommended resolution                                                                                                                                                                                                      |
| --- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F7  | **High (business)** | **VAT is never modelled.** All money is "integer pence", but there is no statement of whether quoted/booked prices are VAT-inclusive, nor a VAT field on the rate card or quote. A UK operator at this scale is almost certainly VAT-registered, and the margin-floor maths (BC3) is materially different net vs gross. | Add VAT to the open-items list (§6). Model `net_pence`, `vat_pence`, `gross_pence` (or a `vat_rate` on the rate card) before Sprint 3. This is a hard input to the pricing engine, not a cosmetic field.                    |
| F8  | Medium              | **Quote input step 8 is missing.** §8.1 lists steps 1–7 then jumps to 9 (contact + consent). Step 8 (almost certainly add-ons) is absent.                                                                                                                                                                               | Confirm step 8 = add-ons selection (ties to `addons_pence`). Trivial, but the step map must be complete before the wizard is built (Sprint 4).                                                                              |
| F9  | Medium              | **`passengerCount` conflict.** §8.1 validates the field as `1–8`, but §8.3's branching rule triggers BC1 on `>= 9`. If the field hard-blocks 9, the branch can never fire.                                                                                                                                              | The field must **accept** 9+ so the multi-vehicle / human-routing branch can render its explanatory copy; the _single-vehicle quote_ is what's blocked, not the input. Clarify in the Zod schema.                           |
| F10 | Medium              | **Gate thresholds are missing for several "gated" collections.** §4.1 marks Airports, Occasions, Comparisons, Case studies with a publish gate, but §4.2 `GATE_THRESHOLDS` only defines services, locations, venues, routes, vehicles, service-locations, guides.                                                       | Define thresholds for every collection whose inventory row shows a gate, or explicitly mark those collections as ungated. The gate hook must fail closed if a collection has no threshold entry.                            |
| F11 | Medium              | **Follow-up "variant dwell" times are undefined.** The SLA table uses `minutes: -1` as a sentinel meaning "a fraction of variant dwell" for `quoted`/`follow_up`, and §10.4 references "five variant ladders", but the per-variant dwell/cadence values are never enumerated.                                           | Produce the five follow-up-ladder cadence tables (wedding, prom, transfer, celebration, corporate) as data before Sprint 5. This is configuration, not code, but the automation cannot ship without it.                     |
| F12 | Low                 | **LCP thresholds differ by context** — lab budget 1.8s (§0.4, §14.4) vs field alarm at LCP p75 > 2.5s (§13.9).                                                                                                                                                                                                          | These are intentionally different (a stricter lab budget than the field alarm), but we will document it so no one "fixes" the apparent mismatch. No change needed.                                                          |
| F13 | Low                 | **`eventDate ≤ +24 months`, but some weddings book further out.** Combined with a 6-month-pre-event nurture entry, 24 months is a reasonable cap, but a subset of wedding enquiries book 24–36 months ahead.                                                                                                            | Confirm the 24-month cap is acceptable, or extend to 36 for the wedding occasion only. Business decision.                                                                                                                   |
| F14 | Low                 | **Root-level `[service]` dynamic segment** shares the top level with many static routes (`venues`, `routes`, `fleet`, `areas`, `about`, …).                                                                                                                                                                             | Next.js prioritises static over dynamic, so this is safe, but `generateStaticParams` must enumerate the 9 services and the segment must `notFound()` on anything else, to avoid a soft-404 farm. Note for Sprint 9.         |
| F15 | Low                 | **"Zero axe violations" ≠ full WCAG 2.2 AA.** Automated tooling catches roughly half of AA success criteria.                                                                                                                                                                                                            | Keep the zero-axe CI gate, but budget a manual accessibility audit (keyboard, screen-reader, focus order, reflow at 320px) before launch. The spec's §15 implies this; we are making it explicit in the Definition of Done. |

---

## 4. Recommended improvements (beyond corrections)

These add durability without departing from the spec's intent. We will implement them **only with your approval**.

1. **A `withTenant` request-context helper and a hostile-tenant integration test** (see F3). Multi-tenancy that isn't proven by a test that _tries_ to cross tenants is multi-tenancy you're hoping works.
2. **One scheduler, not two.** Payload 3 ships its own jobs queue; Inngest is the mandated durable engine (D1). To avoid two mental models, standardise all deferred/scheduled work on **Inngest** and use Payload jobs only where Payload itself requires them. One place to look when a message didn't send.
3. **A minimal DB-backed feature-flag/config service.** The spec references feature flags (Review/AggregateRating flag default-OFF; integration kill switches for graceful degradation) but names no mechanism. A tiny `feature_flags` table read through Redis gives the "disable the dependent path" rollback story (§17.4) a real switch.
4. **Structured logging + trace IDs on the enquiry critical path.** The spec instruments and alerts the enquiry flow (§2.4) but relies on Sentry alone. A correlation ID threaded from Server Action → transaction → Inngest event makes "why did this customer not get their SMS?" answerable in seconds, which is the CRM's stated failure-visibility requirement.
5. **Seed + factory infrastructure early.** Because `lib/domain` is framework-free and Neon gives per-PR branches, we can build realistic seed data (one tenant, a fleet, venues, rate card) in Sprint 1. Every later sprint then develops against believable data, and E2E/UAT is not blocked at the end.

We are **not** recommending replacing any named technology. The stack (Next.js 15 / React 19, Payload 3, Postgres 16 + PostGIS on Neon, Drizzle, Inngest, Typesense, Upstash, Vercel, Cloudflare/R2, Resend/Twilio/WhatsApp, Stripe, Sentry, Auth.js v5) is coherent and each choice is justified against a real requirement. The only stack-adjacent notes are the extension/topology corrections in F1, F4, F6.

---

## 5. Open items requiring business input before build starts

The spec lists seven; we confirm them and add three (marked **+**). Items in **bold** are hard blockers for the critical path.

| #       | Item                                                                      | Blocks                                                                                   |
| ------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1       | **Brand name, domain, trademark decision**                                | URL taxonomy — URLs are permanent once indexed (§7.9). Blocks anything public-facing.    |
| 2       | **Rate card with real figures**                                           | Pricing-engine configuration (Sprint 3). **Hard blocker.**                               |
| 3       | **Actual cost inputs** (chauffeur, fuel, maintenance, finance, insurance) | BC3 margin floor cannot be enforced or tested without them (Sprint 3). **Hard blocker.** |
| 4       | Licensing authority + operator licence number                             | Published on every page; tenant seeding.                                                 |
| 5       | Fleet inventory with verified seat counts                                 | BC1 seeding; capacity constraint.                                                        |
| 6       | Cancellation terms + deposit percentages                                  | Booking logic (Sprint 7).                                                                |
| 7       | Brand palette                                                             | Must pass contrast testing before sign-off (accessibility gate).                         |
| **+8**  | **VAT treatment** (registered? prices inclusive/exclusive? rate)          | Pricing engine + margin maths (F7). Effectively a hard blocker with 2 & 3.               |
| **+9**  | Five follow-up-ladder cadence tables per journey variant                  | Nurture/SLA automations (F11, Sprint 5/11).                                              |
| **+10** | Confirmation of Cloudflare/Vercel DNS topology                            | DNS + caching, best decided before launch (F6).                                          |

> **Everything that does not depend on items 2, 3, and 8 can proceed in parallel.** The schema, constraints, CMS, roles, page templates, SEO, and booking scaffolding do not need real numbers — only the pricing engine and its downstream do.

---

## 6. Development plan — milestones, dependencies, build order

The spec provides a 13-sprint sequence (Sprint 0–12) and correctly names **Sprints 1, 3, 5, 6 as the critical path**. We adopt that sequence and group it into six milestones with explicit dependencies. Sequencing rationale: _nothing is built before the thing it depends on, and the constraints that make the product safe to operate come before the features that generate volume._

### Milestone A — Foundation (Sprints 0–1) · _critical path_

**Deliverables:** Repo, CI/CD (all quality gates wired to fail the build), Vercel + Neon environments, Neon per-PR branching, Docker Postgres+PostGIS for local, WhatsApp template submission (long lead time — start day one). Then: full schema, Drizzle migrations, **all `CHECK` and `EXCLUDE` constraints with tests**, RLS policies + `withTenant` wiring + hostile-tenant test, extensions (postgis, btree_gist, citext, uuid strategy per F1), seed/factory data.
**Depends on:** open items 1, 4, 5 (brand/licensing/fleet for seeding — can use placeholders and backfill).
**Exit criteria:** Every BC that is a DB constraint has a test proving it rejects the bad write. Tenant isolation proven. CI red on any gate breach.

### Milestone B — Content platform & proof gate (Sprint 2)

**Deliverables:** Payload collections, the **BC8 proof gate** hook (with the doorway-page similarity check), media-upload validation (descriptive filenames, alt-text, consent), roles + field-level PII masking, gate thresholds for **all** gated collections (F10), the `page_keywords` uniqueness mechanism (F2).
**Depends on:** Milestone A (schema, roles, RLS).
**Exit criteria:** A page cannot publish below its proof threshold; a >30%-similar page is rejected; media without consent/alt-text/valid filename is blocked.

### Milestone C — Pricing & lead capture (Sprints 3–6) · _critical path_

**Deliverables (in order):**

- **Sprint 3 — Pricing engine.** Pure `lib/domain/pricing`, PostGIS zone derivation, cost model, **BC3 margin floor**, 100% branch coverage. _Hard-blocked by open items 2, 3, 8._
- **Sprint 4 — Quote engine UI + Server Actions + CRM write path.** Progressive wizard, shared Zod schemas, atomic transaction (write-once first-touch source, BC9 next-action), `enquiry/created` event.
- **Sprint 5 — Speed-to-lead.** Instant email/SMS, audible owner alert, SLA escalation ladder, orphan-sweep foundations. _The five-minute response standard._
- **Sprint 6 — Safeguarding & capacity branches (BC1, BC2).** Under-18 parent verification, 9+ multi-vehicle routing, margin-floor human handoff.
  **Depends on:** Milestones A & B; **open items 2, 3, 8 for Sprint 3 specifically.**
  **Exit criteria:** No quote can be issued below 35% margin, under 8-seat capacity, or for under-18s without a verified guardian. Enquiry → owner alert is sub-second and never waits on a third party.

### Milestone D — Booking & fulfilment (Sprints 7–8)

**Deliverables:** Stripe deposit/balance flow, webhook (raw-body signature, idempotency), **resource locking with rollback + automatic refund** on BC5 exclusion-constraint fire, BC4 wedding backup assignment, pre-service Inngest sequence (balance −7d, itinerary −48h, **−24h chauffeur disclosure with photo**, en route −2h), calendar/dispatch.
**Depends on:** Milestone C (a booking starts from an accepted quote); open items 6 (cancellation/deposit terms).
**Exit criteria:** Concurrent bookings for the same vehicle fail deterministically at COMMIT and auto-refund. No wedding confirmable without a backup vehicle.

### Milestone E — Public site & SEO (Sprint 9)

**Deliverables:** All page templates (homepage, service hub, venue [highest ROI], town, route, vehicle, airport, landing), programmatic JSON-LD schema builders, segmented XML sitemaps, generated internal linking, metadata generation, `generateStaticParams` for the top ~200 + ISR for the tail, on-demand revalidation from Payload `afterChange`.
**Depends on:** Milestone B (content) and C (quote engine embeds in heroes/CTAs); open items 1, 4 (brand, licence number on every page).
**Exit criteria:** Every quality gate green on every template — LCP < 1.8s, zero axe violations, valid schema, canonical + sitemap correct, zero orphan pages.

### Milestone F — CRM automation, growth & hardening (Sprints 10–12)

**Deliverables:** Orphan sweep + dead-letter queue + Needs-Attention dashboard (empty by 18:00), the durable wedding-nurture workflow and other variant ladders (F11 cadence tables required), review/referral engines, message-class enforcement (BC6), reporting (in-app real-time + Looker Studio), all integrations finalised, security hardening, business-critical alerting (§13.9), runbooks, **UAT and launch gates**.
**Depends on:** Milestones C–E; open item 9 (cadence tables).
**Exit criteria:** The full **Definition of Done** (§8 below).

### Dependency graph (summary)

```
A (Foundation) ──► B (Content + Proof Gate) ──► E (Public site & SEO)
      │                     │                          ▲
      │                     ▼                          │
      └───────────► C (Pricing + Lead) ───────────────┘
                          │  ▲ (needs rate card + costs + VAT)
                          ▼
                    D (Booking + Fulfilment)
                          │
                          ▼
                    F (CRM automation + Growth + Hardening + Launch)
```

**Critical path:** A → C → (parallel D and E) → F, with Milestone C gated on the two hard business blockers. Milestone B and the front-half of E can run in parallel with C once A is done, because content and templates do not need real prices.

---

## 7. Quality gates & Definition of Done (carried forward as the contract)

Every PR must pass, and the build **fails** on any breach:

- **Performance:** LCP < 1.8s, INP < 150ms, CLS < 0.05, Lighthouse mobile > 90, JS ≤ 90KB gz / CSS ≤ 25KB gz / page ≤ 1.2MB (Lighthouse CI budget).
- **Accessibility:** WCAG 2.2 AA, zero axe violations, plus a manual audit before launch (F15).
- **Correctness:** type-check, lint (including the `lib/domain` import-boundary rule), > 85% business-logic coverage, 100% branch on the pricing engine.
- **SEO:** schema validity, canonical/sitemap regression suite, zero orphan pages.
- **Security:** secret scan, dependency scan, no secret in source control (pre-commit + CI).

**Launch Definition of Done** (§18.9): all 🔴 acceptance criteria pass; full E2E green on staging; UAT signed off by MD, Operations, Sales, Content; runbooks written; **rollback rehearsed**; **backup restore drill completed**; monitoring + business alerts firing; legal pages solicitor-reviewed; **zero stock images anywhere**; WhatsApp templates approved; Stripe live mode tested including refunds and disputes; **two-week parallel run** before decommissioning the current process.

---

## 8. Top risks & mitigations

| Risk                                  | Impact                                                         | Mitigation                                                                                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate card / cost inputs / VAT delayed | Blocks Sprint 3 (critical path)                                | Build the engine against a **placeholder rate card behind an interface** so the code is done and tested; swap real figures in when they arrive. Everything downstream stays unblocked. |
| RLS silently ineffective (F3)         | Cross-tenant data exposure — existential for a franchise model | Non-`BYPASSRLS` app role + `withTenant` wrapper + a CI test that _attempts_ cross-tenant reads and must fail.                                                                          |
| GBP automated posting                 | Profile suspension = existential                               | Keep semi-automated by design; humans perform all writes.                                                                                                                              |
| Silently broken quote engine          | Highest-cost, least-noticed revenue loss                       | Zero-`quote_start`-in-6h daytime-window alarm to MD + dev immediately.                                                                                                                 |
| WhatsApp template approval latency    | Blocks messaging channel at launch                             | Submit in Sprint 0, week 1 — before any code that depends on it.                                                                                                                       |
| Cloudflare/Vercel cache conflict (F6) | ISR/image regressions, hard to change post-launch              | Decide DNS topology in Sprint 0.                                                                                                                                                       |

---

## 9. Immediate next steps (on approval)

1. **You:** confirm/answer the ten open items — prioritising the three hard blockers (rate card, cost inputs, VAT) and the brand/domain decision that fixes URL taxonomy.
2. **Us (Sprint 0, needs no business input to start):** scaffold the repo, CI with every quality gate wired to fail the build, Vercel + Neon environments with per-PR branching, and **submit the WhatsApp templates** (longest lead time).
3. **Us (Sprint 1):** schema, migrations, and every DB constraint **with its rejection test**, RLS + hostile-tenant test, and seed data.

---

## Approval gate

**Per the engagement, no application code will be written until this Phase 1 analysis is approved.** This document is the only artefact produced so far.

Please confirm one of:

- **(a) Approved as-is** — we begin Sprint 0 immediately and start the WhatsApp submission clock.
- **(b) Approved with the noted improvements (§4)** explicitly in or out.
- **(c) Changes requested** — tell us what to revisit.

We also recommend answering open items **2, 3, and 8** as early as possible, since they are the only things standing between us and the critical-path pricing engine.
