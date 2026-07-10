# MyWisata — Malaysia Tourism Portal (FYP)

A local-mock, multi-role demo of a Malaysia-wide tourism discovery & commerce
platform: Customer, Vendor, and Admin areas sharing one canonical seed dataset.
No backend yet — all data lives in the browser's `localStorage`.

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

## Deferred (not in this phase)

AI recommendation/itinerary/smart search, real backend/Supabase, real
auth/passwords, realtime chat, real payment gateway, real QR generation, KYC
OCR, OG-meta social sharing, native mobile app.
