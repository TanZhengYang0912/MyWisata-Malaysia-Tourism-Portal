# MyWisata — Malaysia Tourism Portal (FYP)

A local-mock, multi-role demo of a Malaysia-wide tourism discovery & commerce
platform: Customer, Vendor, and Admin areas sharing one canonical seed dataset.
Backed by a real Supabase project (Postgres + Auth + RLS, see
`supabase/migrations/`) — catalogue, carts, orders, inventory and vouchers all
read and write through Supabase.

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

At `/login`, use Supabase Auth or pick a seeded demo account:

- **Customer** (4 seeded, different verification tiers)
- **Vendor Owner** / **Outlet Manager**
- **Approver** / **Super Admin**

Each role is routed and guarded to its own area:
- Customer → `/explore`, `/search`, `/activity/[id]`, `/map`, `/cart`, `/checkout`, `/orders`, `/chat`
- Vendor → `/vendor/dashboard`, `/vendor/listings`, `/vendor/bookings`, `/vendor/vouchers`, `/vendor/inbox`
- Admin → `/admin/dashboard`, `/admin/vendors`, `/admin/kyc`, `/admin/withdrawals`, `/admin/recommendations`, `/admin/support`

## Supabase setup

Copy the required values into `.env.local` and never commit that file:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
# Optional Qwen Cloud / Alibaba Cloud Model Studio provider; leave unset to defer AI suggestions.
QWEN_API_KEY=...
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-flash-2025-07-28
QWEN_FALLBACK_MODEL=
QWEN_MAX_OUTPUT_TOKENS=500
```

Apply migrations in order with the Supabase CLI or SQL Editor, then run the
remote seed script when demo records are needed. The application reads
operational data from Supabase; it does not use browser localStorage as a
database.

## Tech notes

- **Map**: Leaflet + OpenStreetMap tiles — no API key required.
- **Get Directions**: opens a Google Maps URL (`google.com/maps/dir/?api=1&destination=...`) — no API key.
- **Payment / KYC / booking**: Demo/Mock only. No real money moves, no real ID data stored.
- **Chat**: Supabase-backed text messages with realtime policies where enabled.
- **AI listing assistant**: optional Qwen Cloud integration in cost-safe
  `qwen-flash-2025-07-28` free-tier mode. It is
  disabled safely when no key is configured and all suggestions require vendor
  review before saving/publishing.

## Architecture

```
types/index.ts      — shared domain types (the integration contract)
lib/money.ts         — RM formatting, single rounding function
lib/events.ts        — domain event dispatch (order.paid, withdrawal.reviewed, ...)
lib/audit.ts          — single approve/reject helper (writes AUDIT_LOGS + NOTIFICATIONS)
lib/helpers.ts        — cart totals, voucher validation, distance, order state machine
hooks/use-auth.ts       — Supabase session and role helpers
components/providers/auth.tsx — auth context and role guard
lib/supabase/           — browser/server/service Supabase clients
supabase/migrations/    — schema, RLS and approval workflow migrations
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

Each domain API route validates input before writing to Supabase. Approval and
state transitions use `lib/audit.ts`; all money goes through `lib/money.ts`.

| Member | Route area | Owns seed/repo |
|---|---|---|
| M1 — Platform / Identity / Chat | `/login`, auth, chat, notifications, support | `lib/db/*/identity` |
| M2 — Customer Booking, Map & Discovery | `(customer)/*` | consumes catalogue + commerce repos |
| M2/M1 — Vendor & Catalogue | `vendor/*` | `lib/db/*/catalogue` |
| M3 — Discovery, Recommendation & Growth | recommendations, reviews, affiliate | `lib/db/*/discovery` |
| M4 — Cart, Order, Booking & Wallet | wallet, withdrawals, checkout internals | `lib/db/*/commerce` |

## Deferred by configuration

AI listing suggestions remain deferred until an optional Qwen Cloud API key is
configured. Real payment settlement, QR generation, KYC OCR, OG-meta social
sharing and native mobile remain outside this prototype scope.

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
2. Open any activity (e.g. Georgetown Heritage Walk) → press **Share**. On
   `localhost`, `navigator.share` is usually unavailable, so this copies an
   `/r/AF-XXXXXX/<slug>` link to your clipboard instead — that's the expected
   fallback, not a failure.
3. Open that link in an **incognito window** (no session) — you land on the
   activity page, and a row is logged in `affiliate_clicks`.
4. In a normal window, sign in as **Bob** (`customer2@demo.local`) → go to
   `/dev` → **Simulate purchase (demo only)** on the same activity.
5. Sign back in as Alice → `/customer/affiliate` → 1 click, 1 referral, and
   Pending earnings showing 5% of that activity's price.
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
- `/customer/activity/[id]` isn't public — the `/customer/*` role guard
  bounces anonymous visitors to `/login` before they see the page. The
  affiliate cookie is set *before* that bounce (in the `/r/[code]` redirect,
  which sits outside `/customer/*`), so attribution survives the forced
  login — but a referred visitor still can't preview the activity without
  signing in first.
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

## Deferred (not in this phase)

AI recommendation/itinerary/smart search, realtime chat, real payment
gateway, real QR generation, KYC OCR, native mobile app.

(Real backend/Supabase, real auth/passwords, and OG-meta social sharing were
all originally listed here too, but are done — see "Tech notes" above and
"Affiliate, Sharing & AI Support (P4)" below.)
