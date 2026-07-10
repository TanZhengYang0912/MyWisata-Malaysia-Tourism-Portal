# Malaysia Tourism Portal — FYP Demo

Full-stack multi-vendor tourism discovery platform. **4-person team, 2-week demo target.**

Tech stack: **Next.js 15 · TypeScript · Tailwind CSS · Supabase (PostgreSQL + Auth + Realtime)**

---

## Repository Layout

This repo hosts **two parallel tracks**:

| Track | Location | Purpose | Status |
|-------|----------|---------|--------|
| **Main app** (Next.js + Supabase) | `src/`, `supabase/`, root config | Production track — real DB, 4-person collaborative build | Active — see plan below |
| **Design prototype** (Vite + localStorage) | `design-prototype/` | UI/UX exploration by chihao0127; single-user localStorage mock | Reference only — not deployed |
| **Source docs** | `docs/source/` | Original proposal + 2-week module plan (.docx) | Read-only reference |
| **Working docs** | `docs/` | Ownership, contracts, member plans (Markdown) | Update as team decides |

**Team convention**: the main app at repo root is the shared codebase. The Vite prototype in `design-prototype/` is a UI reference that any member can extract components from, but **it does NOT get deployed and does NOT share code with the main app**.

---

## Quick Start

```bash
# 1. Clone and install
git clone https://github.com/YOUR_ORG/FYP-industrial-project.git
cd FYP-industrial-project
npm install

# 2. Set environment variables
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# from your Supabase project dashboard

# 3. Push database schema
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
# Or for local: npx supabase start && npx supabase db reset

# 4. Create demo auth accounts in Supabase Auth dashboard
# Use the emails in supabase/seed.sql with password: demo123456
# The DB trigger auto-creates public.users + wallet + role assignment

# 5. Run development server
npm run dev
# → http://localhost:3000
```

---

## Demo Accounts

| Role           | Email                        | Password     |
|----------------|------------------------------|--------------|
| Super Admin    | admin@demo.local             | demo123456   |
| Wallet Approver| approver@demo.local          | demo123456   |
| Vendor Owner   | vendor.owner@demo.local      | demo123456   |
| Outlet Manager | outlet.manager@demo.local    | demo123456   |
| Customer Alice | customer1@demo.local         | demo123456   |

Login page has a **Quick Login** switcher — click any role to fill credentials.

---

## Project Structure

```
src/
  app/
    (auth)/            # Login, Register — P1
    (customer)/        # Discovery, Search, Vendors, Cart, Orders, Wallet, Profile — P1+P3+P4
    (vendor)/          # Dashboard, Products, Bookings, Vouchers, Inbox — P2
    (admin)/           # Dashboard, Vendors, KYC, Withdrawals, Recommendations, Support — all
    api/               # REST endpoints (server-side only)
  components/
    ui/                # Button, Card, Badge, Input — shared
    layout/            # CustomerNavbar, VendorSidebar, AdminSidebar — P1
  lib/
    supabase/          # client.ts (browser) + server.ts (RSC/route handlers)
    money.ts           # ONLY file that does arithmetic — never bypass this
    constants.ts       # All status enums — must match DB CHECK constraints
    audit.ts           # auditAndNotify() — called on every approve/reject
    domain-events.ts   # 5 cross-module events (onOrderPaid, etc.)
  hooks/
    use-auth.ts        # AuthUser + role helpers — P1
    use-cart.ts        # Cart state + addToCart/checkout — P4
  types/
    database.ts        # TypeScript row types for all 56 tables
    index.ts           # Domain DTOs (AuthUser, CartSummary, etc.)
supabase/
  migrations/001_initial_schema.sql   # All 56 tables
  seed.sql                            # Demo data (3 vendors, 5 outlets, 20 products, 8 users)
docs/
  module-ownership.md  # Who owns what table / page / API route
  api-contracts.md     # Shared DTO contracts between modules
```

---

## Module Ownership

| Member | Sub-modules | Key Pages | Tables Owned |
|--------|-------------|-----------|--------------|
| **P1** | Auth/RBAC, Profile, Chat, FAQ Bot | `/login`, `/register`, `/profile`, `/vendor/inbox`, `/admin/support` | users, roles, user_roles, chat_*, notifications, audit_logs, support_tickets |
| **P2** | Vendor onboarding, Catalogue, Slots, Vouchers | `/vendor/dashboard`, `/vendor/products`, `/vendor/bookings` | vendors, outlets, products, product_variants, inventory, booking_slots, vouchers |
| **P3** | Discovery, Map, Preferences, Recommendations, Affiliate | `/discovery`, `/search`, `/vendors/[slug]`, `/profile/preferences` | user_preferences, vendor_recommendations, affiliate_links, reviews, share_events, user_interactions |
| **P4** | Cart, Orders, Bookings, Wallet, Withdrawals | `/cart`, `/orders`, `/wallet`, `/admin/withdrawals` | carts, cart_items, orders, order_items, bookings, wallets, wallet_ledger, withdrawal_requests |

**Rule: each team member only writes migrations for tables they own.** Cross-module data access goes through agreed API routes or Supabase queries.

---

## Shared Contracts (read before writing cross-module code)

### Money — `src/lib/money.ts`
All monetary values are **RM (MYR)**. Never use raw `+` / `*` on prices — always import from `money.ts`:
```ts
import { add, lineTotal, applyPercent, toRM } from '@/lib/money';
```

### Auth Context — `src/hooks/use-auth.ts`
```ts
const { user, isAdmin, isVendor, isKyc, canEarn } = useAuth();
// user.activeVendorId — scoped vendor ID for vendor portal
// user.activeOutletIds — scoped outlet IDs for outlet manager
```

### Order State Machine — `src/types/index.ts`
```
draft → pending_payment → paid → completed / refunded / cancelled
```

### Audit + Notify — `src/lib/audit.ts`
**Every approve/reject MUST call `auditAndNotify()`** — this is Gate 5.
```ts
await auditAndNotify(auditParams, notificationArray);
```

### Domain Events — `src/lib/domain-events.ts`
Call the right event after state transitions:
- `onOrderPaid()` → audit + customer notification
- `onWithdrawalReviewed()` → audit + notification
- `onRecommendationConverted()` → audit + wallet credit trigger

---

## Git Workflow

```
main                   ← protected, never push directly
  └── develop          ← integration branch, merge here daily
        ├── feature/P1-auth
        ├── feature/P1-chat
        ├── feature/P2-catalogue
        ├── feature/P3-discovery
        ├── feature/P4-cart
        └── ...
```

**Daily rule:** merge your feature branch → `develop` before end of day and run smoke test.

**Feature freeze:** Day 10 — no new features after this point.

### Branch naming
```
feature/P{1-4}-{sub-module}
# e.g. feature/P1-auth, feature/P3-map, feature/P4-wallet
```

---

## Integration Gates

| Gate | Condition | Target Day |
|------|-----------|-----------|
| G1 — Identity | P1 auth/RBAC live, all use same demo accounts | Day 2 |
| G2 — Supply | P2 catalogue stable, C1/D1 drop fixtures | Day 4–5 |
| G3 — Transaction | P4 D2 order complete; vendor dashboard shows orders | Day 6 |
| G4 — Growth/Wallet | P3 commission → P4 wallet ledger, no double-credit | Day 7–8 |
| G5 — Governance | All approve/reject → P1 audit trail | Day 8 |

---

## Demo Story Lines

1. **Customer Flow:** Login → Fill preferences → See recommended cards → Map view → Vendor detail → Book slot → Voucher → Cart → Mock Pay → Order + QR code
2. **Vendor Flow:** Login → Manage products/slots → See incoming order → Mark fulfilled → Reply in inbox
3. **Contributor Flow:** KYC approved → Recommend vendor → Generate affiliate link → Admin approves → Commission → Wallet withdrawal request
4. **Admin Flow:** Approve vendor → Review KYC → Approve withdrawal (audit trail) → Resolve support ticket

---

## Definition of Done (per sub-module)

- Real DB read/write + at least one seed data path
- Loading / Empty / Success / Validation error states handled
- No double-submit on any button (disable while loading)
- Responsive at 1440px desktop and 390px mobile
- No real payment / KYC / OTP messaging — clearly labelled DEMO/Mock

---

## Commands

```bash
npm run dev          # Start dev server
npm run type-check   # TypeScript check (run before PR)
npm run lint         # ESLint
npm run db:reset     # Reset DB + reseed (local Supabase only)
npm run db:types     # Regenerate TypeScript types from Supabase schema
```
