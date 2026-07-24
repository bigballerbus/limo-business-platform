# Launch Readiness — Kent Limousines Platform

**Purpose:** the go-live contract. It maps the Definition of Done (Phase-1 §7)
to what is built and verified, names the items that are blocked on client or
vendor input, and gives operations the alerting spec and runbooks needed to run
the platform. Read alongside `DECISIONS.md` (the decision record) and
`PHASE-1-DISCOVERY.md` (the plan).

Legend: ✅ done & verified · 🟡 built, awaiting real data/keys · ⛔ blocked on an
open item.

---

## 1. Definition of Done — status

### Correctness

| Gate                                                      | Status | Evidence                                                   |
| --------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| Type-check, lint (incl. `lib/domain` import boundary)     | ✅     | `npm run typecheck`, `npm run lint` green in CI            |
| > 85% business-logic coverage; 100% branch pricing engine | ✅     | Vitest coverage gate; pricing engine at 100% branch        |
| BC1 ≤8 passengers                                         | ✅     | DB CHECK + `capacityDecision` + integration test           |
| BC2 under-18 guardian                                     | ✅     | DB CHECK + `canTakeDeposit` gate + deposit-blocked test    |
| BC3 35% margin floor                                      | ✅     | DB CHECK + engine `BelowMarginFloorError` + test           |
| BC4 wedding backup vehicle                                | ✅     | DB CHECK + `planResources` guard + confirm test            |
| BC5 no double-booking (+ auto-refund)                     | ✅     | `EXCLUDE` constraint + SAVEPOINT rollback + refund test    |
| BC6 message-class send gate                               | ✅     | `sendWithin` gate + suppression tests                      |
| BC8 proof gate                                            | ✅     | Payload hook + `evaluate`/`similarity` + Local-API e2e     |
| BC9 never-forgotten lead                                  | ✅     | DB next-action CHECK + orphan sweep + dead-letter queue    |
| Multi-tenant isolation (RLS, hostile-tenant test)         | ✅     | non-BYPASSRLS role + `withTenant` + cross-tenant deny test |

### Performance / Accessibility / SEO / Security

| Gate                                                 | Status | Notes                                                                           |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| Lighthouse perf ≥ 0.90, CLS ≤ 0.05, byte budgets     | ✅     | LHCI budgets hard-fail; absolute LCP/TBT are warnings until CWV pass (T-008)    |
| WCAG 2.2 AA, zero axe violations                     | ✅     | Playwright + axe on templates; manual audit before launch (F15)                 |
| Valid JSON-LD on every template; canonical + sitemap | ✅     | pure builders + `sitemap.ts`/`robots.ts`; regression tests                      |
| Zero orphan pages                                    | ✅     | `findOrphans` over the internal-link graph                                      |
| Secret scan, dependency scan, no secret in VCS       | ✅     | gitleaks pre-commit + CI                                                        |
| Security headers                                     | 🟡     | Enforced via middleware; **CSP is Report-Only** until tuned against real pages  |
| Quote endpoint rate limiting                         | 🟡     | Per-IP fixed window; **store is process-local** — move to shared store at scale |

---

## 2. Blocked on client / vendor input (open items)

| Ref    | Blocks                                             | Owner                |
| ------ | -------------------------------------------------- | -------------------- |
| OI-2/3 | Real rate card + cost inputs (BC3 with true costs) | Client + Accountant  |
| OI-4   | Licensing authority + operator licence on pages    | Client               |
| OI-6   | Deposit % + cancellation terms                     | Client               |
| OI-8   | Launch service area → town/venue/route pages       | Client + Engineering |
| OI-11  | Nurture cadences + referral reward figures         | Engineering → Client |
| OI-12  | Vendor accounts & live keys (see §4)               | Client + Engineering |

Placeholders are documented and clearly labelled; swapping each is configuration,
not code (D-004 pattern).

---

## 3. Business-critical alerting (§13.9)

Alerts route to the on-call operations channel. Each has an owner and a runbook
(§5).

| Alert                               | Condition                                                      | Severity |
| ----------------------------------- | -------------------------------------------------------------- | -------- |
| Needs-Attention not clear by 18:00  | `findNeedsAttention` non-empty at the 18:00 sweep              | High     |
| Dead-letter opened                  | any `dead_letters` row inserted (async step exhausted retries) | High     |
| Payment webhook signature failures  | > 3 rejected webhooks in 5 min (possible misconfig or attack)  | Critical |
| Deposit taken, resource unfulfilled | `booking/refunded` reason `resource_unavailable` (BC5 fired)   | High     |
| SLA breach level 3                  | `slaEnforcement` escalation reaches level 3                    | Critical |
| Quote error rate                    | `submitQuote` 5xx rate > 2% over 10 min                        | Critical |
| Inngest function failure            | any function fails after all retries                           | High     |

Wiring these to the provider (Sentry / Better Stack) is an OI-12 task; the
conditions above are the source signals the platform already emits (events,
dead-letters, trace logs).

---

## 4. Vendor cutover (OI-12)

Every third party sits behind an interface with a working stub, so cutover is a
config + adapter swap with no caller changes:

| Vendor                     | Interface / seam                   | Swap                                        |
| -------------------------- | ---------------------------------- | ------------------------------------------- |
| Stripe                     | `PaymentProvider` (`stubPayments`) | `StripePaymentProvider`; set webhook secret |
| Resend / Twilio / WhatsApp | `Notifier` (`stubNotifier`)        | real adapters; submit WhatsApp templates    |
| Inngest Cloud              | `inngest` client + `/api/inngest`  | set signing/event keys                      |
| Geocoding                  | `stubGeocoder`                     | real provider adapter                       |
| Looker Studio              | `reporting_funnel` view            | read-only federated connection              |

Secrets are provisioned by infrastructure (never in VCS); the app role is
non-owner, non-BYPASSRLS in production as locally.

---

## 5. Runbooks

**A payment webhook is failing signature verification.** Confirm the webhook
secret matches the provider dashboard. Verification failing closed (HTTP 400) is
correct — no booking is confirmed on an unverified event. Replayed valid events
are idempotent, so re-delivery after fixing the secret is safe.

**BC5 fired — a deposit was auto-refunded.** The customer paid but the vehicle
was taken concurrently; the booking is `cancelled` (`resource_unavailable`) and a
`refund` payment recorded. Contact the customer, offer an alternative vehicle or
date, and create a fresh booking. The refund is already issued.

**Needs-Attention is not clear.** Open the dashboard (`/api/internal/needs-attention`),
work the list top-down (critical first). Overdue leads are re-driven hourly by
`attentionSweep`; dead-letters need a human decision (resolve or ignore with a
note).

**Postgres / RLS.** All runtime access is via `withTenant`; if queries return no
rows unexpectedly, confirm `app.tenant_id` is set (policies fail closed). The
app role must remain non-owner and non-BYPASSRLS.

**Rolling back a deploy.** Migrations are additive and recorded in
`schema_migrations`; never edit an applied migration — add a new one. Inngest
functions are replayable and resume from their last durable step.

---

## 6. Go-live gate (sign-off checklist)

- [ ] Real rate card, costs and deposit terms loaded (OI-2/3/6) and BC3 verified against them.
- [ ] Licence number + authority published site-wide (OI-4).
- [ ] Launch service-area pages generated and in the sitemap; zero orphans (OI-8).
- [ ] Live vendor keys set; a real test deposit → confirm → refund cycle passes end-to-end (OI-12).
- [ ] WhatsApp templates approved; transactional email/SMS delivering.
- [ ] Alerting wired and a test alert received on-call (§3).
- [ ] CSP flipped from Report-Only to enforcing after UAT tuning.
- [ ] Manual accessibility audit passed (F15); legal pages solicitor-reviewed.
- [ ] Analytics + Looker Studio connected to `reporting_funnel`.
