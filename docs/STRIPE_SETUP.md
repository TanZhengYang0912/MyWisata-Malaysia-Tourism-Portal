# Stripe Payout Gateway Setup

Enables real Stripe API + webhook flow for the withdrawal approval → payout journey.
**Test mode is 100% free** — no billing account required, no time limit.

Steps 1–5 take ~15 minutes.

---

## Prerequisites

- Stripe account (free): https://dashboard.stripe.com/register
- Stripe CLI installed locally (for webhook forwarding during dev):
  https://stripe.com/docs/stripe-cli#install
  - macOS: `brew install stripe/stripe-cli/stripe`
  - Windows: download from https://github.com/stripe/stripe-cli/releases

---

## Step 1 — Get test API keys

1. Open https://dashboard.stripe.com/test/apikeys (**test mode**, top-right toggle)
2. Copy the **Secret key** (starts `sk_test_...`) — this is `STRIPE_SECRET_KEY`
3. Keep this tab open — you'll need step 4.

⚠️ **Never commit these to git.** The `.gitignore` already excludes `.env.local`.

---

## Step 2 — Create a Test Connected Account for demo payouts

Stripe Connect lets your platform pay out to other accounts. For the demo,
we use ONE hardcoded test account as the destination for every payout.

**Option A — Quick (recommended for FYP demo):**

1. Go to https://dashboard.stripe.com/test/connect/accounts/overview
2. Click **+ Create account**
3. Choose **Express** account type
4. Country: **Malaysia (MY)**
5. Email: any test email like `demo-payout@fyp.local`
6. Click **Create**
7. Copy the account ID that starts with `acct_...` — this is `STRIPE_DEMO_CONNECT_ACCOUNT`

**Option B — Full (proper Connect onboarding, P1 work):**
Wire up `stripe.accountLinks.create()` for each user to onboard themselves.
Deferred — see `payout_destinations.stripe_account_id` column added in migration 008.

---

## Step 3 — Start the Stripe CLI webhook listener

In a **new terminal**, keep this running while you develop:

```bash
stripe login          # opens browser once for auth
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Output looks like:
```
> Ready! Your webhook signing secret is whsec_abcd1234... (^C to quit)
```

**Copy the `whsec_...` value** — this is `STRIPE_WEBHOOK_SECRET`.

⚠️ This secret is regenerated each time you run `stripe listen`. If it changes,
update `.env.local` and restart `npm run dev`.

---

## Step 4 — Add keys to `.env.local`

```
STRIPE_SECRET_KEY=sk_test_51NAbCdEfGh...
STRIPE_WEBHOOK_SECRET=whsec_abcd1234...
STRIPE_DEMO_CONNECT_ACCOUNT=acct_1MyTestAccount
```

Restart the dev server: `Ctrl+C` then `npm run dev`.

---

## Step 5 — Apply migration 008

Supabase Dashboard → SQL Editor → paste `supabase/migrations/008_stripe_payout_state.sql` → RUN.

**Verify** with:
```sql
SELECT proname FROM pg_proc
WHERE proname IN ('record_payout_pending','complete_payout','fail_payout');
-- expected: 3 rows
```

The `approve_withdrawal` RPC also changed: `approve` now ends at `'approved'`
instead of `'completed'`. The Stripe webhook moves it to `'completed'` after
the transfer settles.

---

## Verification — end-to-end payout demo

1. Both terminals running: `npm run dev` and `stripe listen --forward-to ...`
2. Reset Alice's balance:
   ```sql
   UPDATE wallets SET available_balance = 45 WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000005';
   DELETE FROM withdrawal_requests
    WHERE user_id = 'aaaaaaaa-0000-0000-0000-000000000005' AND status IN ('pending','approved','processing');
   ```
3. Login as `customer1@demo.local` → `/wallet` → Request Withdrawal → **RM 20** → Confirm
4. Login as `approver@demo.local` → `/admin/withdrawals` → click **Approve** on Alice's request
5. **Watch the `stripe listen` terminal**: you should see:
   ```
   --> transfer.created  [evt_...]
   <-- [200] POST http://localhost:3000/api/webhooks/stripe
   --> transfer.updated  [evt_...]
   ```
6. Check Stripe Dashboard → https://dashboard.stripe.com/test/connect/transfers
   The transfer appears with amount **RM 20.00** and status **Paid**.
7. Refresh `/wallet` as Alice → withdrawal shows as **completed**, wallet_ledger has a
   `withdrawal_complete` entry.

**In production**: swap `sk_test_...` for `sk_live_...` and complete real Connect
account onboarding for each recipient. That's the only difference.

---

## Failure paths to demo

**Failure 1 — Stripe unreachable**
Stop `stripe listen`, then approve a withdrawal. The approve API succeeds
(request stays at `'approved'`) and audit_logs records `withdrawal.payout_deferred`.
Admin can retry via `POST /api/admin/withdrawals/[id]/payout`.

**Failure 2 — Simulated transfer failure**
Stripe test mode doesn't expose `transfer.failed` easily. In production this
route is triggered by the webhook; we've wired the code path but exercising it
requires either:
  - The `stripe trigger transfer.reversed` CLI command
  - Manually calling `POST /api/webhooks/stripe` with a crafted signed payload

---

## Troubleshooting

**"STRIPE_SECRET_KEY is not set"**
`.env.local` missing the key. Restart dev server after adding.

**"currency 'myr' cannot be used with this destination account"**
Your Test Connected Account's country isn't MY. Recreate as Malaysia.

**Webhook 400 "invalid signature"**
`STRIPE_WEBHOOK_SECRET` doesn't match the running `stripe listen` session.
Copy the new `whsec_...` from the terminal and restart dev server.

**"Withdrawal must be approved to initiate payout"**
The request is in a different state. Check `SELECT status FROM withdrawal_requests WHERE id = '...'`.

**Approver approves but nothing appears in Stripe Dashboard**
`stripe listen` isn't running or has stale secret. Restart it and check the
terminal shows `--> transfer.created`.
