# Setup Guide — From Empty Supabase Project to Running Demo

Follow these steps in order. Skipping any step will cause the demo to fail.
Total time: ~15 minutes.

---

## 0. Prerequisites

- Node.js 20+ (`node -v` to check)
- npm 10+
- A Supabase project created at https://supabase.com/dashboard
- (Optional but recommended) Supabase CLI: `npm install -g supabase`

---

## 1. Get Supabase credentials

Go to your project → **Settings → API**. Copy these three values:

| Field                     | Where in the dashboard             |
|---------------------------|-------------------------------------|
| Project URL               | Project URL box (starts `https://`) |
| Anon / public key         | Project API keys → `anon` `public`  |
| Service role key (secret) | Project API keys → `service_role`   |

⚠️ The **service_role key** bypasses ALL security. Never commit it, never send to the browser. It's only used by the local seed script.

---

## 2. Create `.env.local`

In the project root:

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi... (long string)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...  (long string, DIFFERENT)
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEMO_MODE=true
```

---

## 3. Install dependencies

```bash
npm install
```

This installs Next.js, Supabase clients, vitest, and everything else.

---

## 4. Push database migrations

You have two paths — pick one.

### Path A — Supabase CLI (recommended)

```bash
supabase login                        # opens browser once
supabase link --project-ref <your-ref>  # ref is in your dashboard URL
supabase db push                      # applies 001, 002, 003, 004 in order
```

### Path B — Manual SQL Editor

Go to Supabase Dashboard → **SQL Editor** → paste and RUN, in this order:

1. `supabase/migrations/001_initial_schema.sql`  (56 tables)
2. `supabase/migrations/002_governance_functions.sql`  (5 transactional RPCs)
3. `supabase/migrations/003_rls_policies.sql`  (Row Level Security)
4. `supabase/migrations/004_audit_notify_rpc.sql`  (audit + notify RPCs)

Verify: Dashboard → **Table Editor** should show ~57 tables including `users`, `wallets`, `idempotency_keys`.

---

## 5. Create demo auth users

```bash
npm run seed:users
```

Expected output:
```
  ✓  admin@demo.local              created (aaaaaaaa…)
  ✓  approver@demo.local           created (aaaaaaaa…)
  ✓  vendor.owner@demo.local       created (aaaaaaaa…)
  ...
Done — created: 8, skipped: 0, failed: 0
```

The auth trigger auto-populates `public.users` + `wallets` + `customer` role for each new auth user.

**Re-runs are safe** — existing users are skipped.

---

## 6. Run seed data

Dashboard → **SQL Editor** → paste and run `supabase/seed.sql`.

This adds:
- Full profile fields for the 8 demo users
- 3 vendors, 5 outlets, 20 products, 12 slots, 4 vouchers
- Sample completed order + wallet balance for Alice
- FAQ knowledge base, categories, platform settings

Re-runs are safe (all use ON CONFLICT DO UPDATE / DO NOTHING).

---

## 7. Start dev server

```bash
npm run dev
```

Open http://localhost:3000 — you should see the login page.

Login with **customer1@demo.local** / **demo123456** → lands on `/discovery`.

Login with **admin@demo.local** → can access `/admin/*`.

---

## 8. Verify the industrial-grade wiring

Quick smoke test to confirm RLS + RPCs + audit are working:

```bash
# Run unit tests
npm test

# Should output: 30 passed (money.test.ts)
```

Then in the running app:

1. Login as **customer1@demo.local**
2. Go to `/wallet` — should show RM 45.00 available, RM 12.50 pending
3. Try to request withdrawal of RM 30 — should succeed
4. Login as **approver@demo.local** — go to `/admin/withdrawals`
5. Approve the request
6. **Verify audit fired**: Dashboard → Table Editor → `audit_logs` should have new rows
7. **Verify notification fired**: `notifications` table should have "Withdrawal approved" for Alice
8. Login back as Alice — `/wallet` should show new balance

If audit_logs or notifications is empty after these actions, **migration 004 did not run**. Re-run it.

---

## Troubleshooting

### "Not authenticated" when calling RPCs
Check that you signed in through the app, not just through the Supabase dashboard. RLS reads `auth.uid()` from the JWT cookie.

### "duplicate key value violates unique constraint"
`npm run seed:users` was already run. Skip step 5 and go to seed.sql.

### Demo users login fails with wrong password
Password is `demo123456` (no spaces, all lowercase). If a user was created manually via the dashboard, delete and re-run `npm run seed:users`.

### `supabase db push` fails on migration 003
RLS policies fail if a table doesn't exist. Verify migration 001 completed by checking Table Editor. Then re-run push.

### Notifications show empty even after admin actions
Migration 004 didn't run. Check Dashboard → Database → Functions for `record_audit_and_notify`. If missing, run migration 004 SQL manually.

### CI failing on GitHub Actions
Local env vars aren't in CI. Add them as GitHub Secrets:
- Settings → Secrets → Actions → New repository secret
- Only need `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for build/type-check.
