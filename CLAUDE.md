# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

MyWisata — a Malaysia tourism portal (FYP). Next.js 16 (App Router) + Supabase
(Postgres, Auth, RLS). Three portals share one Supabase project: customer,
vendor, and admin. **`README.md` is stale** — it describes an old localStorage-mock
version of this app (`lib/db`, `lib/auth.tsx`, a `(customer)/` route group) that
no longer exists. Don't trust its "Architecture" section; the real structure is
below.

## Commands

```bash
npm run dev              # dev server
npm run build / start    # production build / serve
npm test                 # vitest run — all unit tests
npx vitest run path/to/file.test.ts   # single test file
npx vitest run -t "test name substring"  # single test by name
npm run lint              # eslint
npx tsc --noEmit           # typecheck (not a package.json script, but the
                            # standard way to verify a change compiles)
npx playwright test        # e2e — NOT wired to any npm script, run directly.
                            # Needs `npm run dev` running (playwright.config.ts
                            # webServer expects it / can reuse an existing one).
```

Seeding / verifying the remote demo dataset (all hit the live Supabase project,
no local Supabase stack in this repo):
```bash
REMOTE_DEMO_SEED=1 npm run seed:remote-demo   # idempotent full demo seed
npm run seed:chat-volume                       # bulk chat threads/reports for scale testing
npm run seed:remote-scenarios
npm run verify:remote-demo                     # row-count sanity check
npm run verify:remote-scenarios
```

No CI (`.github/workflows/` doesn't exist) — nothing enforces lint/test/build on
push; run checks locally before considering work done.

## Architecture

### Three portals, one Supabase project
`app/customer/**`, `app/vendor/**`, `app/admin/**` — each with its own layout,
and `app/api/**` mirroring them (`api/vendors/[vendorId]/**`, `api/admin/**`,
plus shared domains like `bookings`, `checkout`, `stripe`, `chat`). Also:
`app/login` (real sign-in **and** a leftover demo-account picker, see below),
`app/auth/callback` (OAuth), `app/r/[code]` (affiliate/referral redirect),
`app/dev/**` (internal dev tools, not customer-facing), `app/reset-password`,
`app/account-restore` / `app/account-suspended` (account lifecycle, driven by
`lib/account/lifecycle.ts`), `app/outlet-manager-invitations`.

### Auth is real, but a demo shortcut is wired into it
Real Supabase Auth (`supabase.auth.signInWithPassword`, OAuth, magic link).
`app/api/auth/demo-signin/route.ts` also signs in any `@demo.local` seeded
account with a hardcoded password (`demo123456`) — real auth under the hood,
not a mock, but a seeded-demo shortcut still live in the login UI.

Role/scope resolution reads three tables: `user_roles` (role + optional
vendor/outlet), `outlet_managers` (outlet-manager assignments), and
`vendors.owner_id`. `app/api/auth/me/route.ts` computes `activeVendorId` /
`activeOutletIds` from these for the client.

**Role gating is inconsistent across the three portals — know this before
assuming a pattern generalizes:**
- Customer and admin layouts both use `useRequireRole()` from
  `components/providers/auth.tsx` — client-side redirect to `/login` if the
  role doesn't match.
- Vendor's layout (`app/vendor/layout.tsx`) only checks "is anyone logged in"
  server-side — no role check there. Enforcement instead happens client-side
  in `components/layout/vendor-access-gate.tsx` (only restricts
  `outlet_manager` to an allowlist of paths) and at the data layer (a page
  redirects to `/login` once its data fetch comes back empty for a
  non-vendor).
- **Two separate `useAuth` hooks exist and aren't unified**:
  `components/providers/auth.tsx`'s (customer + admin layouts, login page) vs.
  `hooks/use-auth.ts`'s (vendor sidebar + access gate, fetches
  `/api/auth/me`). Don't assume changing one affects the other.

Vendor portal has a first-class `vendor_owner` (full access) vs
`outlet_manager` (scoped to assigned outlets) distinction — reflected in
`components/layout/vendor-sidebar.tsx` swapping to a reduced nav for outlet
managers, and enforced server-side by `authorizeVendor()` (below).

### Data access layer
`backend/core/types.ts` is the shared domain type contract — "read the type,
not the DB shape" (its own header comment). `backend/domains/*.ts` is one file
per domain: `catalogue.ts` / `catalogue-filters.ts` (vendors, outlets,
activities, search), `commerce.ts` (cart, orders, bookings, wallet),
`identity.ts` (profile, chat, support tickets), `discovery.ts` (vendor
recommendation submissions), `preferences.ts` (static vocab, no I/O),
`recommend.ts` + `recommend-score.ts` (personalised feed — score/rank logic is
pure and I/O-free, orchestration isn't), `review-metrics.ts` /
`review-presenter.ts` (pure aggregation/DTO mapping).

I/O-bearing domain functions default their last param to a shared Supabase
client (`db: SupabaseClient = supabase`, from `backend/supabase.ts`, which
wraps the **browser anon client**) — callers can override with a scoped
client. `backend/domains/current-user.ts` is an outlier: it's still
`window.localStorage`-based, a leftover from the pre-Supabase mock era, not
representative of the domain pattern.

Supabase clients (`lib/supabase/`):
- `client.ts` — browser anon singleton (guards against multiple-GoTrueClient warnings).
- `server.ts` — async, cookie-aware, anon key, RLS-respecting — for Server Components/route handlers.
- `service.ts` — `createServiceClient()`, service-role key, **bypasses RLS entirely**.
- `proxy.ts` — middleware session-cookie refresh.

**Vendor authorization pattern** (`lib/vendor-authorization.ts`) —
`authorizeVendor()` / `authorizeOutlet()` — is the pattern to follow when a
route needs service-role power but must not let a caller escalate scope:
resolve role + scope with the anon/session client first (`vendors.owner_id`
for owner, `outlet_managers` join for outlet_manager), and only then attach a
service-role client already tied to that verified `vendorId`/`outletIds`.
This is **not consistently applied** — only ~30 routes use it; the rest call
`createServiceClient()` more directly. Treat this as a known gap, not a
justification to skip the pattern in new code.

API routes return a consistent `{ data, error }` envelope via
`apiOk`/`apiFail` (`lib/validation/schemas.ts`), with `parseBody()` for
Zod-validated request bodies (422 on failure). Domain-specific Zod schemas
live in `lib/validation/<domain>-schemas.ts` (e.g. `vendor-schemas.ts`),
convention `<entity><Action>Schema`, with `*UpdateSchema` commonly a
`.partial()` of the matching create schema.

### The database is the source of truth — migration files can lie
`supabase/migrations/` has 92 files across two incompatible naming schemes
(numbered `001`–`039`, with real renumbering collisions, then
timestamp-prefixed files). **The live Supabase project's migration history is
a squashed set that does not match the local `.sql` files** — the live DB has
columns and functions that exist in no local migration file (see
`docs/longevity-remediation-plan.md`, Risk #1, and README.md for prior
examples). Corollary: a migration can be written and even merged without ever
being applied to the live project — this has caused real bugs (a feature
coded against a column that was never actually added live). **Before trusting
what a migration file implies about the live schema, verify directly against
the live database** (Supabase MCP tools — `list_tables`, `execute_sql`
against `information_schema`, etc.) rather than assuming the migration ran.

RLS policy naming follows a `<table>_<scope>` vocabulary — `_own`
(caller owns the row), `_participant` (caller is a party to it, e.g. chat),
`_admin` (admin-only) — not universal, but the recurring pattern.

### Testing
Vitest (`vitest.config.ts`: alias `@` → repo root; excludes `tests/e2e/**`,
`scripts/**/*.test.mjs`, `docs/**`). ~94 `*.test.ts` files, colocated in
`__tests__/` folders next to the code they test (e.g.
`backend/domains/__tests__/`, `lib/customer/__tests__/`); a handful sit
directly beside their source file instead. Mostly pure logic/schema tests; no
repo-wide Supabase mock helper, mocking is ad hoc per file.

`tests/integration/kyc-security.spec.ts` runs under plain Vitest but
self-skips unless `RUN_KYC_DB_INTEGRATION=1` and the `KYC_TEST_SUPABASE_*` env
vars are set — it hits a real disposable Supabase project when enabled.
`npm run test:kyc-db:replay` rebuilds that disposable DB from every migration
and is destructive; it refuses to run unless `KYC_TEST_DB_RESET_CONFIRM`
exactly matches the parsed project ref of `KYC_TEST_DATABASE_URL`.

`tests/e2e/*.spec.ts` (Playwright) exist as files only — no `package.json`
script wires them up; run with `npx playwright test` directly.

### Where design rationale lives
`docs/adr/` has 28 ADRs (numbered, some gaps) covering wallet/ledger design,
Postgres security patterns (security-definer RPCs, `SELECT ... FOR UPDATE`
locking), Stripe Connect payouts, affiliate/commission rules, KYC/tiering, and
a few testing decisions. Check there before assuming a schema/RPC shape is
accidental — it may be a documented tradeoff.

### Non-obvious `lib/` subdirectories
`lib/kyc/` (IC/document verification: hashing, magic-byte file-type sniffing),
`lib/admin-ai/` + `lib/chatbot/` (Gemini-backed assistants; `lib/chatbot/pii.ts`
redacts PII before every outbound LLM call), `lib/moderation/` (profanity/flag
pipeline — distinct from the unrelated `lib/moderation.ts` at root),
`lib/demo-map/` (Malaysia-specific map/geo data), `lib/rate-limit/` (DB-backed,
not in-memory), `lib/vendor-authorization.ts` (see above; not inside a
`vendor/` subfolder). `lib/vendor-scope.ts` duplicates what
`authorizeVendor()`/`/api/auth/me` already compute and has effectively one
caller — near-dead code, not a pattern to extend.
