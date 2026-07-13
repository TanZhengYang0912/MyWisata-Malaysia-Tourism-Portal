# ADR-019: onOrderPaid contract, Level 1 idempotency, state machine hardening

**Status:** Accepted  
**PR:** 019 — `019_pr_industrial_atomicity.sql`

---

## Context

PR 019 closed seven Sys-Arch gaps identified in the reward / attribution modules:

- **Gap 1 & 2 (P0):** `onOrderPaid()` was never called from any real payment path, and its `processAffiliateAttribution()` function read from `next/headers cookies()` — making it permanently broken in server-to-server contexts (webhooks, admin actions, cron).
- **Gap 3 (P1):** `credit_pending_recommendation` had no idempotency guard. Retrying `onOrderPaid()` for the same order would double-credit every commission.
- **Gap 4 (P1):** `admin_review_kyc` had no state guard — an admin could reject an already-verified user, creating inconsistent state.
- **Gap 6 (P2, closed as non-issue):** `earnings_sen` is deducted atomically in `debit_withdrawal` at withdrawal request time, not on admin approval. No gap.
- **Gap 7 (P1):** The `checkDailyLimit` helper was a non-atomic read-before-write. Two concurrent requests could both pass the limit check.

---

## Decisions

### 1. `orders.affiliate_click_id` — cookie → column

**Decision:** Add `orders.affiliate_click_id UUID REFERENCES affiliate_clicks(id) ON DELETE SET NULL`.

**Rationale:**  
The `mw_ref` cookie carrying the affiliate click ID is only available in browser HTTP request context. A column on `orders` is available in any context. Whoever creates the order (checkout owner) reads the cookie once at order-creation time and persists it. `onOrderPaid(orderId)` reads from the column, not from cookies. This is the canonical hexagonal architecture pattern: the adapter (checkout HTTP handler) translates the transport-layer signal (cookie) into domain language (click ID on order), and the domain service (`onOrderPaid`) only speaks domain language.

**Checkout owner contract:** When creating an `orders` row, read `cookies().get('mw_ref')?.value`, write to `orders.affiliate_click_id`, delete the cookie. See `app/api/dev/simulate-purchase/route.ts` for the reference implementation.

### 2. Level 1 idempotency via partial unique indexes

**Decision:** Add two partial unique indexes on `recommendation_commissions`:

```sql
CREATE UNIQUE INDEX uniq_rec_comm_bonus
  ON recommendation_commissions (conversion_id)
  WHERE commission_type = 'bonus';

CREATE UNIQUE INDEX uniq_rec_comm_ongoing
  ON recommendation_commissions (conversion_id, order_id)
  WHERE commission_type = 'ongoing' AND order_id IS NOT NULL;
```

Plus a CHECK constraint: `commission_type <> 'ongoing' OR order_id IS NOT NULL`.

**Rationale:**  
Application-layer idempotency checks (read-before-write) have a TOCTOU window that concurrent requests or retry loops can exploit. DB unique constraints are the only mechanism that atomically combines "does this row exist?" and "insert it" in a single operation. The `credit_pending_recommendation` RPC uses `ON CONFLICT DO NOTHING RETURNING id` — if `RETURNING` is null, the commission already exists and all wallet ops are skipped. This converts a potential double-credit into a no-op.

The CHECK constraint prevents callers from accidentally bypassing the ongoing idempotency index by omitting `order_id`.

### 3. `admin_review_kyc` strict state machine

**Decision:** Both `UPDATE kyc_submissions` and `UPDATE users` in `admin_review_kyc` now include `WHERE status = 'pending'` / `WHERE kyc_status = 'kyc_submitted'` guards. If neither row matches, the RPC raises `kyc_not_pending_or_not_found`.

**Rationale:**  
Strict single-direction state machines are easier to audit than free-form transitions. If an admin made an incorrect approval, the correct remediation is to ask the user to re-submit (`submit_kyc` resets `kyc_submissions.status` back to `pending`), not to call `admin_review_kyc('reject')` on a verified user.

### 4. `submit_recommendation` SECURITY DEFINER RPC with advisory lock

**Decision:** Replace the 3-step Node.js flow (count check + ilike + insert) with a single `submit_recommendation` RPC that opens a per-user `pg_advisory_xact_lock` before checking the count and duplicate, then inserts.

**Rationale:**  
`pg_advisory_xact_lock(hashtext('rec_submit:' || uid))` serializes all concurrent calls from the same user within a transaction. This makes the count check and the duplicate check atomic — the lock is held for the transaction's duration and released automatically on commit or rollback. No extra table needed.

The same pattern is applied to `submit_kyc` (concurrent upload button clicks) and is available for any future RPC that needs per-user serialization.

---

## Deferred

- **Gap 5 (P1) — Stripe transfer non-atomic:** Withdrawal approve path creates a Stripe Transfer before writing the transfer ID to DB. Retry risk = double transfer. Fix: write a `withdrawal_stripe_attempts` row with a Stripe idempotency key before calling Stripe. Tracked as **PR 020**.
- **KYC daily rate limit:** The existing `checkDailyLimit` on `kyc_submissions` was broken (upsert schema means there is always at most 1 row, so count is always ≤ 1). Proper rate limiting requires a `kyc_submission_history` table. Deferred — advisory lock in `submit_kyc` prevents concurrent parallel abuse, which is the primary risk.
