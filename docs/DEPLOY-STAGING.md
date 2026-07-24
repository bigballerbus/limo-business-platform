# Deploy a staging site to click through

This gets the platform onto a public URL you can open in any browser and test
end to end. It uses free tiers only — no cost. Payments, email and SMS run on
safe test stubs, so nothing real is charged or sent; everything else behaves
exactly as it will in production.

The deploy provisions its own database automatically (the build runs the
migrations and loads sample data), so you don't run any commands or share any
credentials with anyone.

## What you'll need (two free sign-ups, ~10 minutes)

### 1. A database — Neon (free)

1. Go to **https://neon.tech** and sign up (GitHub login is easiest).
2. Create a **new project** — any name, region **EU (London or Frankfurt)**.
3. On the project dashboard, copy the **connection string** (starts with
   `postgresql://…`). Keep it handy for step 3 below.

### 2. The website — Vercel (free)

1. Go to **https://vercel.com** and sign up with the **same GitHub account**
   that owns the `limo-business-platform` repo.
2. Click **Add New… → Project**, find **limo-business-platform**, and click
   **Import**.
3. Before clicking Deploy, open **Environment Variables** and add these two:

   | Name             | Value                                                     |
   | ---------------- | --------------------------------------------------------- |
   | `DATABASE_URL`   | the Neon connection string from step 1                    |
   | `PAYLOAD_SECRET` | any long random text (30+ characters — mash the keyboard) |

4. Click **Deploy**. First build takes ~2–3 minutes (it's setting up the
   database and loading sample data as it goes).

That's it. Vercel gives you a URL like `https://limo-business-platform-xxxx.vercel.app`.

## What to test

- **Homepage** `/` — the hero, services grid, FAQs.
- **A service page** `/services/weddings` (also `/proms`, `/airport-transfers`,
  `/corporate`, `/celebrations`).
- **The quote engine** `/quote` — fill it in and submit to see the instant price
  and the coordinator-callback messaging. Try:
  - **9+ passengers** → the multi-vehicle message.
  - Tick **"passengers under 18"** → the parent/guardian fields appear.
- **The CMS admin** `/admin` — create your first admin user, then add/edit
  content (guides, FAQs, legal pages).

## Good to know

- **Nothing real happens** — the deposit/payment, email and SMS steps use test
  stubs. No card is charged, no message is sent. Wiring live vendors is the
  go-live step (see `LAUNCH-READINESS.md`).
- **Prices are illustrative** — the rate card is a documented placeholder until
  your real figures are loaded.
- To wire your live domain, payments and messaging later, follow the vendor
  cutover in `LAUNCH-READINESS.md`.
