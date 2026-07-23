# Runbook — WhatsApp Business template submission

**Why this is a Sprint 0 item:** WhatsApp template approval takes several days,
and Meta Business verification can take longer. Submitting now removes it from
the launch critical path (spec §1.13, §12.8).

> ⚠️ This is a **client action** — it requires the Kent Limousines Meta Business
> account and the production phone number. Engineering provides the template
> content below; the client (or engineering with delegated access) submits it in
> the WhatsApp Manager.

## Prerequisites

1. A **Meta Business account**, verified (Business Verification can take days).
2. A **WhatsApp Business Account (WABA)** and a dedicated phone number (not
   already used on the consumer WhatsApp app).
3. A display name matching the brand: **Kent Limousines**.

## Message-class rule (BC6)

Every template is tagged with a **class**: `transactional` (utility) or
`marketing`. Utility templates are tied to a specific transaction (a booking,
a payment) and are sent regardless of marketing consent. Marketing templates
require opt-in. Choose the WhatsApp **category** to match: `UTILITY` for
transactional, `MARKETING` for promotional.

## Templates to submit

Placeholders use `{{n}}` positional variables per WhatsApp’s format. Copy is
British English. Final wording is confirmed with the client before submission.

### 1. `quote_ready` — UTILITY

> Hi {{1}}, thanks for your enquiry with Kent Limousines. Your quote for {{2}}
> on {{3}} is ready: {{4}}. Reply here or call {{5}} and we’ll take care of the
> rest.

Variables: 1 first name · 2 service · 3 event date · 4 price · 5 phone.

### 2. `booking_confirmed` — UTILITY

> Good news {{1}} — your booking with Kent Limousines is confirmed. Reference
> {{2}}, {{3}} on {{4}}. We’ll be in touch before the day with your final
> details.

Variables: 1 first name · 2 reference · 3 service · 4 date/time.

### 3. `balance_reminder` — UTILITY

> Hi {{1}}, a friendly reminder that the balance for booking {{2}} ({{3}}) is due
> by {{4}}. You can pay securely here: {{5}}.

Variables: 1 first name · 2 reference · 3 date · 4 due date · 5 payment link.

### 4. `chauffeur_details` — UTILITY

> Hi {{1}}, your chauffeur for tomorrow is {{2}}, driving a {{3}}. They’ll arrive
> at {{4}} for your {{5}}. Any changes, just reply here.

Variables: 1 first name · 2 chauffeur · 3 vehicle · 4 pickup time · 5 occasion.
(Supports the −24h chauffeur disclosure, spec §9.7.)

### 5. `on_the_way` — UTILITY

> Hi {{1}}, your Kent Limousines chauffeur is on the way and will arrive at
> approximately {{2}}. Safe travels!

Variables: 1 first name · 2 ETA.

### 6. `review_request` — MARKETING

> Hi {{1}}, we hope you enjoyed your journey with Kent Limousines. If you have a
> moment, we’d be grateful for a quick review: {{2}}. Thank you!

Variables: 1 first name · 2 review link. (Requires marketing opt-in.)

## After approval

- Record each template’s **name, language, category and variable order** in the
  messaging integration config (added in the messaging sprint).
- The sending layer tracks the **24-hour customer-service window** and chooses
  free-form vs template accordingly (spec §12.8).
- Opt-in must be recorded **before** any business-initiated marketing message.

## Status log

| Date  | Template | Status            | Notes                               |
| ----- | -------- | ----------------- | ----------------------------------- |
| _tbd_ | all      | Not yet submitted | Awaiting Meta Business verification |
