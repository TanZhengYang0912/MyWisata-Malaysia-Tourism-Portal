# MyWisata — Malaysia Tourism Portal (FYP)

A Supabase-backed, multi-role prototype of a Malaysia-wide tourism discovery &
commerce platform: Customer, Vendor, and Admin areas share one canonical
database and role-aware access policies.

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
