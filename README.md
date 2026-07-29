# MyWisata — Malaysia Tourism Portal (FYP)

A local-mock, multi-role demo of a Malaysia-wide tourism discovery & commerce
platform: Customer, Vendor, and Admin areas sharing one canonical seed dataset.
Backed by a real Supabase project (Postgres + Auth + RLS, see
`supabase/migrations/`) — only the shopping cart still lives in the browser's
`localStorage`, since there's no signed-in session to key a server-side cart on.

## Destructive KYC test replay

`npm run test:kyc-db:replay` drops and recreates `public` on a disposable KYC test database. It never accepts generic database variables. Set `KYC_TEST_DATABASE_URL` and `KYC_TEST_SUPABASE_URL`, then explicitly acknowledge the parsed project ref for each invocation:

```powershell
$env:KYC_TEST_DB_RESET_CONFIRM = '<KYC test project ref>'
npm run test:kyc-db:replay
```

The command refuses before connecting unless it can strictly parse the same valid project ref from the API URL and a recognised direct or pooler database URI, and the confirmation exactly matches that ref. Similar-looking or substring refs are rejected.

KYC security tests and retention jobs

- `KYC_IC_HMAC_KEY` is a server-only secret used to fingerprint IC numbers. Configure it in the server environment; never expose its value to the browser, logs, or audit payloads.
- Set `RUN_KYC_DB_INTEGRATION=1` to enable the disposable-database integration suite. The suite reads only `KYC_TEST_SUPABASE_URL`, `KYC_TEST_SUPABASE_ANON_KEY`, and `KYC_TEST_SUPABASE_SERVICE_ROLE_KEY` for its test project.
- Destructive replay additionally requires `KYC_TEST_DATABASE_URL` and `KYC_TEST_DB_RESET_CONFIRM`. The confirmation must be the parsed project reference for the KYC test URL; do not put credentials or secrets in source control.
- Rejected and superseded evidence is retained for 90 days from its terminal transition. Approved evidence is retained until 90 days after account closure or after a later approved replacement; purge removes only private storage objects and their evidence worklist rows, preserving submission metadata. The purge cron returns aggregate counts only.

Design ported from the Figma-Make prototype in [`Docs/User greeting/`](Docs/User%20greeting/)
(palette, fonts, screen layouts). The full screen/flow spec is in
[`Docs/User greeting/src/imports/figma-prototype-implementation-plan.md`](<Docs/User greeting/src/imports/figma-prototype-implementation-plan.md>).

## Prerequisites

- Node.js ≥ 20 LTS
- npm

## First-time setup

```bash
git clone <repo-url>
cd FYP-industrial-project
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/login`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm test` | Run unit tests (money, voucher, distance, order-state helpers) |
| `npm run lint` | Lint |

## Demo accounts

## Production readiness checklist

Before enabling the live verification and payout paths, configure and verify these items in the deployment environments. Secret values must stay in Vercel/Supabase settings and must never be committed to this repository.

- **Vercel Cron:** set `CRON_SECRET` in Production and bind `/api/cron/wallet-maintenance` to the checked-in `vercel.json` schedule. Confirm a real run returns escalation, reward-clearance, and report results in server logs; repeat the run to confirm it is safe to retry.
- **Supabase Auth:** enable Confirm Email, configure `/auth/callback` in the allowed redirect URLs, and configure the Google OAuth provider. A Google identity with a trusted `email_verified` claim receives only Email Verified status; Phone Verification, Profile Completion, and KYC remain separate requirements.
- **KYC OCR:** configure `GOOGLE_AI_KEY` and optionally `GEMINI_OCR_MODEL`. If the key is missing or the provider fails, the submission remains pending and the API marks `manualReviewRequired: true`; OCR must never approve KYC by itself.
- **Stripe payouts:** configure the Stripe Connect account and both webhook secrets, then verify successful, duplicate, and failed webhook deliveries. Failed provider codes/messages are normalized and stored without exposing credentials or raw personal data.
- **TNG eWallet payouts:** configure the real TNG Direct Credit merchant credentials and the provider adapter only after the official provider contract is available. The application accepts a TNG phone/DuitNow reference, never a TNG PIN, and keeps the feature visibly unavailable until the provider is genuinely configured.
- **Supabase migrations:** apply the additive industry-readiness migrations `087`, `088`, `089`, and `090` after migration `086`. Verify destination snapshots, review-source RPCs, report amount keys, and payout-failure fields before testing withdrawals.

Recommended smoke sequence: create an email account and verify it, sign in with Google, verify a phone, complete the five profile fields, submit and review KYC, create a verified payout destination, submit a withdrawal, exercise Approve/Reject/Hold/Failed paths, generate the monthly report, and inspect the maintenance run logs.

At `/login`, pick a seeded role — no password (mock auth):

- **Customer** (4 seeded, different verification tiers)
- **Vendor Owner** / **Outlet Manager**
- **Approver** / **Super Admin**

Each role is routed and guarded to its own area:
- Customer → `/explore`, `/search`, `/activity/[id]`, `/map`, `/cart`, `/checkout`, `/orders`, `/chat`
- Vendor → `/vendor/dashboard`, `/vendor/listings`, `/vendor/bookings`, `/vendor/vouchers`, `/vendor/inbox`
- Admin → `/admin/dashboard`, `/admin/vendors`, `/admin/kyc`, `/admin/withdrawals`, `/admin/recommendations`, `/admin/support`

## Resetting data

All data lives in the browser's `localStorage`, seeded once on first load.
Click **"Reset demo data"** on the `/login` page (or run `resetDemo()` from
`lib/db` in the console) to wipe and reseed from the canonical dataset —
useful before every demo run.

## Tech notes

- **Map**: Leaflet + OpenStreetMap tiles — no API key required.
- **Get Directions**: opens a Google Maps URL (`google.com/maps/dir/?api=1&destination=...`) — no API key.
- **Payment / KYC / booking**: Demo/Mock only. No real money moves, no real ID data stored.
- **Chat**: local text messages only, no realtime backend.
- **AI features** (recommendation / itinerary / smart search): deferred. The discovery layer is structured so a scored/LLM layer can slot in later without UI changes.

## Architecture

```
lib/types.ts        — shared domain types (the integration contract)
lib/money.ts         — RM formatting, single rounding function
lib/events.ts        — domain event dispatch (order.paid, withdrawal.reviewed, ...)
lib/audit.ts          — single approve/reject helper (writes AUDIT_LOGS + NOTIFICATIONS)
lib/helpers.ts        — cart totals, voucher validation, distance, order state machine
lib/auth.tsx           — AuthContext, demo account switcher, useRequireRole() guard
lib/cart.tsx            — Cart context (localStorage-backed)
lib/db/
  index.ts              — localStorage engine + resetDemo()
  seed/                  — canonical seed data, one file per domain
  repos/                 — data-access functions, one file per domain
app/
  login/                 — demo account switcher
  (customer)/            — Customer journey (Member 2)
  vendor/                 — Vendor dashboard shell
  admin/                   — Admin dashboard shell
components/
  ui/                      — shadcn/ui primitives
  customer/ map/ vendor/ admin/ shared/
```

## Ownership map (extension points for teammates)

Each `lib/db/seed/<domain>.ts` + `lib/db/repos/<domain>.ts` file has one
owner. Add your domain by writing your own seed/repo files and route
screens; consume other domains only through their exported repo functions
(the swap point for a real backend later). Any approve/reject action goes
through `lib/audit.ts`; cross-domain effects fire through `lib/events.ts`;
all money goes through `lib/money.ts`.

| Member | Route area | Owns seed/repo |
|---|---|---|
| M1 — Platform / Identity / Chat | `/login`, auth, chat, notifications, support | `lib/db/*/identity` |
| M2 — Customer Booking, Map & Discovery | `(customer)/*` | consumes catalogue + commerce repos |
| M2/M1 — Vendor & Catalogue | `vendor/*` | `lib/db/*/catalogue` |
| M3 — Discovery, Recommendation & Growth | recommendations, reviews, affiliate | `lib/db/*/discovery` |
| M4 — Cart, Order, Booking & Wallet | wallet, withdrawals, checkout internals | `lib/db/*/commerce` |

## Affiliate, Sharing & AI Support (P4)

Built per `CLAUDE.md` (Member 4's build spec): affiliate link generation and
click tracking, commission attribution, social sharing, an FAQ chatbot, and
support ticket escalation — plus admin oversight for both. Lives under
`lib/affiliate/`, `lib/chatbot/`, the matching `app/api/*` routes, the
redirect at `app/r/[code]`, and `app/customer/affiliate` / `app/admin/affiliate`.

### New migrations: `supabase/migrations/011_affiliate_and_support.sql` + `012_seed_gap_fill.sql`

(Originally 009/010 — renumbered to 011/012 after `009_stripe_wallet.sql` was pushed by another
member and merged first. `012` fills two rows the live project was missing entirely —
`platform_settings['demo.mode']` and the 5 seeded chatbot FAQ docs — see its own header comment.)

Additive only — run both against your Supabase project (`supabase db push`, or
paste each into the SQL editor, in order) before testing anything below:

- Duplicate-payout guard: `UNIQUE(order_id)` on `affiliate_attributions`, so
  the conversion hook firing twice for the same order is a no-op, not a
  double commission.
- `support_tickets.category` column + an index on `support_tickets(status)`.
- Seeds a 5% `commission_rules` row (`rule_type='affiliate'`) —
  `supabase/seed.sql` never inserted one, so the commission rate lookup
  previously found nothing.
- Enables RLS on `affiliate_clicks` / `affiliate_attributions`, which had
  been sitting with RLS off entirely (missing from every
  `ENABLE ROW LEVEL SECURITY` list) — any logged-in user could otherwise
  read or write anyone else's click and commission data directly from the
  browser. Adds own-link-and-admin SELECT policies.
- Adds an admin-read SELECT policy on `affiliate_links` (a second, additive
  permissive policy alongside the existing owner-only one — regular users'
  access is unchanged).
- Fixes a keyword collision in the seeded chatbot KB docs so "how do I
  withdraw money" resolves to the withdrawal FAQ instead of the rewards FAQ
  (both docs shared the keywords `how`/`money` as seeded — see
  `lib/chatbot/match.ts` and the migration file's own comments for the math).

### Running the full affiliate → commission → chatbot → admin loop

1. `/login` → sign in as **Alice** (`customer1@demo.local`, KYC-approved).

   **Update, this session:** the affiliate gate is `meetsMinTier(profile.tier,
   REQUIRED_TIER.AFFILIATE_BASIC)` — `'profile_complete'`, not
   `'kyc_verified'` — both in `app/api/affiliate/link/route.ts` (unchanged)
   and now also in `lib/affiliate/verification.ts`'s shared client-side
   check, renamed `isAffiliateEligible()` (was `isKycApproved()`, which
   incorrectly gated on `'kyc_verified'` and blocked the `/customer/affiliate`
   dashboard and the Share button's affiliate-code embedding for anyone
   below full KYC, even though the server-side link-creation route never
   required that). Alice's `tier` had drifted to `'email_verified'` (below
   even the old threshold); she's been promoted to `'profile_complete'` via
   `admin_set_tier()` so this demo step works without a 403. If any step
   here still 403s with `TIER_INSUFFICIENT`, check `users.tier` first — this
   is un-backfilled seed data drifting, not an intentional gate.
2. Open any activity (e.g. Georgetown Heritage Walk) → press **Share**. On
   `localhost`, `navigator.share` is usually unavailable, so this copies an
   `/r/AF-XXXXXX/<slug>` link to your clipboard instead — that's the expected
   fallback, not a failure.
3. Open that link in an **incognito window** (no session) — you land on the
   activity page, and a row is logged in `affiliate_clicks`.
4. In a normal window, sign in as **Bob** (`customer2@demo.local`) → go to
   `/dev` → **Simulate purchase (demo only)** on the same activity.
5. Sign back in as Alice → `/customer/affiliate` → 1 click, 1 referral, and
   Pending earnings showing a commission at Alice's current tier rate. **Not
   a flat 5% anymore** — Phase 2 (Feature B) made this tiered (Bronze /
   Silver / Gold by lifetime confirmed referrals), and Phase 2 fixes
   confirmed the live rates were separately overwritten by a teammate's
   migration (`016_reward_final.sql`) to Bronze 3%/0, Silver 4%/4, Gold
   5%/8 — not the 3%/5%/7% originally spec'd. A fresh KYC'd affiliate starts
   at Bronze (3%); check `/admin/affiliate`'s Commission Tiers panel for
   whatever the live rate actually is, since it's admin-editable and can
   drift from any number written down here.
6. Press **Simulate purchase** again for the same visitor/activity —
   referrals should **not** increase. The duplicate-payout guard held.
7. Click your *own* affiliate link and simulate a purchase as yourself — no
   commission should be created. The self-referral guard held.
8. Open the chat bubble (bottom-right, on any `/customer/*` page) → ask
   *"how do I withdraw money"* → it answers from the KB.
9. Ask something unrelated, e.g. *"is the tour wheelchair accessible"* → the
   bot admits it doesn't know and offers **"Get help from our team"** →
   press it to create a ticket.
10. Sign in as **Admin** (`admin@demo.local`, super_admin) → `/admin/support`
    → the ticket is there with its category and full chatbot transcript →
    move it through Open → In Progress → Resolved.
11. `/admin/affiliate` → platform totals, the top-earners leaderboard, and
    the suspicious-activity panel.

**Available earnings will stay at RM 0.00 throughout this demo** — nothing in
this build ever clears a `pending` attribution to `confirmed` (there's no
clearance job yet, for any commission system in this repo). Pending earnings
moving is the correct, complete signal.

### Known issues for whoever owns checkout / `identity.ts`

- `commerce.ts::createOrder()` inserts `status: "PAID"` (uppercase) into
  `orders.status`, which only allows lowercase values under its CHECK
  constraint — this insert is very likely failing today. **It's not just a
  case fix**: `orders`/`order_items` also have RLS enabled with SELECT-only
  policies (no INSERT policy exists at all), and `createOrder()` runs from a
  client component via the old anon `backend/supabase.ts` client — so even a
  corrected lowercase insert would still be rejected by RLS. Checkout likely
  needs to move server-side (a route using the service-role client) to fix
  both problems at once.
- The affiliate commission hook, `lib/affiliate/attribution.ts::onOrderPaid(orderId)`,
  needs one line added at the end of a *fixed* `createOrder()`
  (`await onOrderPaid(order.id)`) — but it reads cookies via `next/headers`,
  which only works inside a real server request context. It can't be called
  from today's client-component `createOrder()` as-is; moving checkout
  server-side (above) is a prerequisite for this, not a separate step. Until
  then, `/dev`'s purchase simulator (a real Route Handler) exercises this
  hook correctly.
- ~~`/customer/activity/[id]` isn't public — the `/customer/*` role guard
  bounces anonymous visitors to `/login` before they see the page~~ —
  **fixed**, per `CLAUDE-PUBLIC-PRODUCT-RETURN.md`. `lib/affiliate/redirect.ts`
  now sends anonymous visitors to the existing `/guest/activity/[id]` /
  `/guest/vendor/[vendorId]` pages (built for Guest Mode) instead of the
  login-gated `/customer/*` equivalents; logged-in visitors are unaffected.
  Live-verified: incognito click → lands on `/guest/activity`, product
  visible, no login wall, `mw_ref` cookie set → sign in as a different user →
  cookie survives → simulate purchase → `affiliate_attributions` row created,
  correctly attributed to the link owner, not the buyer.
- ~~`/guest/activity/[id]` and `/guest/vendor/[vendorId]` had no Open Graph
  metadata — the exact pages the above fix now sends anonymous referral
  recipients to, so shared links unfurled no preview on WhatsApp/FB~~ —
  **fixed**. Both pages now export `generateMetadata()`; the activity one
  calls a new shared helper (`lib/affiliate/activity-metadata.ts`, also now
  used by `/customer/activity/[id]`, so the two tag sets can't drift) that
  reads the product via the **service-role** client rather than the
  cookie-aware one, for the same reason as `resolveProductNames()`: an
  already-referred product can be re-edited back to `review_status =
  'pending_review'` by its vendor, and an already-circulating link shouldn't
  suddenly go blank. Live-verified with a crawler UA: `og:title`,
  `og:description`, absolute `og:image` (resolves 200), and `og:url` (the
  guest/customer page's own path, not the other one) all present and at
  parity between `/guest/activity/[id]` and `/customer/activity/[id]` for a
  real product.
  - **Known limitation, live-confirmed, not fixed here:** the metadata read
    itself is correctly RLS-agnostic, but if the page's own body then calls
    `notFound()` (its pre-existing, untouched logic — e.g. because the
    product really is `pending_review` and the cookie-aware read in the page
    body can't see it), Next.js discards the whole page's metadata, including
    ours, and falls back to the site default. Confirmed live by temporarily
    flipping a real product to `pending_review` and reverting immediately
    after. Net effect: a `pending_review` product only gets a real preview via
    the `/r/[code]/[slug]` redirect's own separate crawler shield
    (`renderOgPreview()` in `lib/affiliate/redirect.ts`), not via a direct or
    post-redirect hit on `/guest/activity/[id]` itself. Closing that gap fully
    would mean loosening the guest page's own visibility check, which is a
    bigger change than "add metadata" — flagging rather than doing it here.
  - **Unrelated bug found while verifying, not fixed here:** the demo product
    `demo-020-chicken-rice-ball-set` has `outlet_id: null` — orphaned seed
    data. `getComputedActivity()` silently drops it (the `outlets` join comes
    back empty), so `/guest/activity/[id]` 404s for it and
    `/customer/activity/[id]` silently renders a null-activity state instead
    of the real product, for reasons unrelated to anything in this module.
- ~~`affiliate.cookie_days` "isn't actually configurable live"~~ — **investigated,
  turned out to be a missing seed row, not a code bug, now fixed.**
  `lib/affiliate/settings.ts::getAttributionCookieDays()` was already the
  single source of truth for both call sites (`lib/affiliate/redirect.ts`'s
  cookie-set and `lib/affiliate/attribution.ts`'s expiry guard call the exact
  same function — no duplication, no drift risk between them). Live-verified
  by temporarily seeding a scratch `affiliate.cookie_days=45` row and
  confirming the redirect's `mw_ref` cookie `Max-Age` changed to exactly
  `45 * 86400` before reverting — the pipeline works end to end. The only
  real gap was that `platform_settings['affiliate.cookie_days']` genuinely
  didn't exist live, so the window was silently running on the code's
  `DEFAULT_COOKIE_DAYS = 30` fallback rather than an admin-configurable
  value. `091_affiliate_cookie_days_setting.sql` seeds it with the same
  value (`30`) the fallback already used — additive, idempotent
  (`WHERE NOT EXISTS`), matches the pattern `037_affiliate_click_cap.sql`
  already established for a sibling setting. No behavior change; the window
  is just one `UPDATE` away from being changed now, instead of a deploy.
- ~~Two gaps found while fixing the above, both outside this module's
  ownership (Auth) — flagging, not fixing~~ — **fixed**, per
  `CLAUDE-RETURN-URL-PART2.md`, with explicit sign-off to edit these shared
  files directly. Smallest possible change in each — no authorization logic
  touched, `postLoginPath()` reused rather than a second validator:
  - `app/login/page.tsx`'s demo quick-login (`pick()`) now reads `next` via
    `postLoginPath()` and uses it when present, falling back to the existing
    `HOME_BY_ROLE[role]` default exactly as before when it isn't — so a
    demo-account login with no `next` behaves identically to today.
  - `useRequireRole()` (`components/providers/auth.tsx`) now appends
    `?next=<current path + search>` when it redirects to `/login`. Only the
    redirect target changed — the `auth.loading` / `allowed.includes(...)`
    authorization checks are untouched.
  - Live-verified end to end (real browser, real DB): incognito referred
    visitor → `/guest/activity` → "Sign in to purchase" → **quick-login** →
    lands back on the product page (not the homepage) → commission still
    attributes to the sharer. Deep-linking straight to `/customer/wallet`
    while anonymous → `/login?next=%2Fcustomer%2Fwallet` → back on
    `/customer/wallet` after login. `?next=https://evil.com` still safely
    rejected through the quick-login path too, not just password login. No
    regressions: plain `/login` with no `next` still lands admin/customer
    accounts on their normal role home; hitting `/login` while already
    authenticated behaves as before; anonymous visitors are still blocked
    from cart/wallet/admin, and a `customer`-role account is still blocked
    from `/admin/dashboard`.
  - ~~Also observed: a live-verified simulate-purchase created a correct
    `affiliate_attributions` row but produced no `wallet_transactions` row —
    `credit_earnings()` may be silently failing~~ — **not a bug, checked
    further and retracting this.** By Phase 2 design (migration 014's
    comment, `lib/affiliate/clearing.ts`), `onOrderPaid()` only ever inserts
    a `pending` attribution; `creditAffiliateCommission()` is called
    exclusively from `clearMaturedCommissions()`, which only runs once a
    commission clears (7-day window in prod, or immediately via the
    demo-mode-gated `/api/dev/force-clear`). Live-verified end to end: after
    calling force-clear on a fresh pending attribution, Alice's
    `wallets.earnings_sen` increased by exactly the commission amount
    (1416→1526 sen, +RM 1.10 matching the attribution's `commission_amount`),
    a correctly-noted `wallet_transactions` row was created, and the
    attribution flipped `pending`→`confirmed` with `cleared_at` set. The
    payout path works correctly — it's just gated behind the clearing step,
    which a bare simulate-purchase doesn't trigger.
- `identity.ts::getSupportTickets()` maps `category: t.body` (the ticket's
  free-text body) onto its returned `category` field — a leftover from
  before `support_tickets.category` existed. It's now stale; read
  `support_tickets.category` directly instead (see
  `app/api/admin/tickets/route.ts`).
- `identity.ts::resolveTicket()` (and the old "Mark Resolved" button) very
  likely doesn't work either — `support_tickets` has no UPDATE RLS policy at
  all, and that function uses the anon client. This module's own
  `PATCH /api/admin/tickets/[id]` uses the service-role client and works.
- ~~`commerce.ts::getWalletBalance()` queries a `wallets.balance_sen` column
  that doesn't exist~~ — **fixed** by the wallet system rewrite
  (`009_stripe_wallet.sql` + `backend/domains/commerce.ts` changes): it now
  reads `topup_sen + earnings_sen`. Leaving this line struck through rather
  than deleted since other notes in `CLAUDE.md` still reference the old bug.
- **Affiliate commissions now credit through `credit_earnings()`** (the
  wallet owner's new RPC), not the old `wallets.pending_balance` directly —
  see `lib/affiliate/wallet-credit.ts`. One consequence: `credit_earnings()`
  credits immediately (spendable + withdrawable), with no pending/confirmed
  staging on the real wallet side — but `/customer/affiliate`'s "Pending
  Earnings" card still labels it Pending, since `affiliate_attributions.status`
  never transitions to `'confirmed'` (see `CLAUDE.md` Step 6 for the full
  explanation). The money is real the moment it's credited; the dashboard
  label just hasn't caught up to that yet.

## Admin AI + PII Compliance (§7.1 / §7.3)

Built per `CLAUDE-ADMIN-AI.md`: PII redaction at every Gemini call, plus an
admin-only AI assistant with three capabilities. Lives under `lib/admin-ai/`,
`lib/chatbot/pii.ts`, and `app/api/admin-ai/*`.

### ⚠️ Migration required before ANY of this works — including the existing customer chatbot

`supabase/migrations/034_admin_ai.sql` adds `chatbot_messages.pii_detected`
and `chatbot_sessions.channel`. **This is not optional or admin-only**:
wiring `pii_detected` into the existing `POST /api/chatbot/ask` route (so
customer chatbot messages log the same signal) means the customer chatbot
now fails with a `DB_ERROR` on every question until this migration is
applied. Paste this into the Supabase SQL Editor before testing anything
below (it's idempotent — safe to run more than once):

```sql
ALTER TABLE chatbot_messages
  ADD COLUMN IF NOT EXISTS pii_detected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE chatbot_sessions
  ADD COLUMN IF NOT EXISTS channel VARCHAR(10) NOT NULL DEFAULT 'customer'
    CHECK (channel IN ('customer', 'admin'));
```

I didn't apply this myself — a live schema change to shared tables needs
your review, same as every other migration this project. Everything below
this line is live-verified against the deployed code; the DB write paths
that need the two new columns are the one thing I could only verify by
inspecting the resulting error message, not by seeing real data land.

### PII redaction (Part 1)

`lib/chatbot/pii.ts::redactPII()` — Malaysian IC (dashed and 12-digit bare),
phone, email, credit-card-like digit runs, and passport numbers. This is the
hard boundary: `lib/chatbot/embed.ts` and `lib/chatbot/generate.ts` both
redact internally before any Gemini call, regardless of caller — not just at
one upstream call site. The **original** message is what's stored in
`chatbot_messages` (the user needs to see what they typed); only the copy
sent to Google is redacted. `chatbot_messages.pii_detected` logs whether
anything was found, never the PII itself.

### Admin AI assistant (Part 2) — `/admin/ai-assistant`, gated on `super_admin` only

Stricter than the rest of `/admin` (which also lets `approver` in) —
`lib/affiliate/admin-guard.ts::isSuperAdmin()`, checked server-side in every
`/api/admin-ai/*` route, not just hidden from nav.

- **Capability 1 — ask about platform metrics.** The LLM never writes SQL
  and never sees a raw row. `lib/admin-ai/queries.ts` is a fixed registry of
  parameterised, aggregate-only queries (supabase-js query builder only, no
  raw SQL string interpolation anywhere in that file) — the registry itself
  is the security boundary. Two Gemini calls: one picks a query by name +
  params (JSON tool-call style), the second phrases the aggregate result in
  natural language. A question with no matching registered query — including
  any request for a specific customer's PII — gets a refusal or "here's what
  I can answer," never an improvised query.
- **Capability 2 — draft staff messages.** `POST /api/admin-ai/draft`, pure
  generation, no data access. The admin types the specifics; the bot never
  fetches them. Draft is editable text — the bot never sends anything.
- **Capability 3 — moderation assistant.** A read-only "AI review" button on
  `/admin/recommendations` (`app/admin/recommendations/page.tsx` — another
  member's screen; this only reads `vendor_recommendations`, never writes to
  it or its approval flow). Advisory only: completeness, a fuzzy
  duplicate-name signal, quality notes, and a low-risk/needs-review flag —
  never auto-approves or auto-rejects.

Dev-only: every outgoing Gemini payload (post-redaction) is logged to the
server console (`lib/admin-ai/gemini.ts`) so the "no raw PII in the request"
claim is checkable, not just asserted.

## Deferred (not in this phase)

AI recommendation/itinerary/smart search, realtime chat, real payment
gateway, real QR generation, KYC OCR, native mobile app.

(Real backend/Supabase, real auth/passwords, and OG-meta social sharing were
all originally listed here too, but are done — see "Tech notes" above and
"Affiliate, Sharing & AI Support (P4)" below.)
