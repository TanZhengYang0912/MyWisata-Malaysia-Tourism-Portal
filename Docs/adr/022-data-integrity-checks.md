# ADR-022: Cross-column CHECK constraints and wallet ledger reconciliation

**Status:** Accepted  
**PR:** 022 — `022_data_integrity_checks.sql`

---

## Context

PR 022 closes the P2 (data integrity) gap category. Four categories of impossible state were identified that the schema permitted but the application logic was assumed to prevent:

1. **Temporal inversion** — `booking_slots.ends_at <= starts_at`: a slot that ends before it begins is schedulable but impossible to fulfil.

2. **Non-positive commission amount** — `recommendation_commissions.amount <= 0`: a commission row crediting zero or negative money is semantically invalid and could corrupt ledger calculations.

3. **Zero-length attribution window** — `recommendation_conversions.attribution_ends_at <= converted_at`: an attribution window that expires instantly means every commission credited to it is orphaned.

4. **Bucket/type mismatch in wallet_transactions** — a `topup` type transaction recorded in the `earnings` bucket silently corrupts ledger reconciliation without raising any error. The existing `type` and `bucket` CHECKs are independent; neither catches cross-column violations.

5. **Terminal withdrawal without Stripe IDs** — a withdrawal in `processing`, `paid`, or `completed` status with `stripe_transfer_id = NULL` is unreachable through the normal admin-approve flow but reachable via direct SQL or a future code path. The CHECK enforces the invariant established by PRs 019–020 at the DB layer.

---

## Decisions

### CHECK constraints

All five constraints are added with `IF NOT EXISTS` and a pre-flight DO block that aborts the migration if any existing row would violate the new CHECK — preventing silent data loss where PostgreSQL would reject the constraint silently on a live DB.

```sql
-- 1. Temporal
booking_slots:               ends_at > starts_at

-- 2. Positive commission
recommendation_commissions:  amount > 0

-- 3. Positive attribution window (NULL = window not yet set)
recommendation_conversions:  attribution_ends_at IS NULL
                              OR attribution_ends_at > converted_at

-- 4. Bucket↔type cross-check (wallet_transactions)
wt_bucket_type_consistent:
  (type = 'topup'               AND bucket = 'topup')                         OR
  (type = 'spend'               AND bucket IN ('topup','earnings'))             OR
  (type = 'earnings'            AND bucket = 'earnings')                       OR
  (type = 'withdrawal_reserve'  AND bucket = 'earnings')                       OR
  (type = 'withdrawal_cancel'   AND bucket = 'earnings')                       OR
  (type = 'withdrawal_complete' AND bucket = 'earnings')                       OR
  (type = 'earnings_pending'    AND bucket = 'pending_earnings')               OR
  (type = 'earnings_confirm'    AND bucket IN ('earnings','pending_earnings')) OR
  (type = 'earnings_reverse'    AND bucket = 'pending_earnings')

-- 5. Stripe IDs in terminal state
withdrawal_requests:  status NOT IN ('processing','paid','completed')
                      OR (stripe_transfer_id IS NOT NULL
                          AND stripe_payout_id IS NOT NULL)
```

### `check_data_integrity()` reconciliation RPC

An admin-only SECURITY DEFINER RPC that computes the expected wallet balances from `wallet_transactions` and reports divergences. Three checks:

1. **Wallet ledger imbalance** — for each wallet, compare stored `earnings_sen / pending_earnings_sen / topup_sen` against the ledger sum. `withdrawal_complete` is excluded from the debit side because it is a settlement log entry: the actual earnings deduction happened at `withdrawal_reserve` time.

2. **Terminal withdrawals missing Stripe IDs** — catches any rows that violated the invariant before migration 022 was applied (or were inserted outside the normal code path).

3. **Pending commissions on expired windows** — `recommendation_commissions.status = 'pending'` where `recommendation_conversions.attribution_ends_at < now()`. These commissions will never be confirmed; they should be manually reviewed.

### Why not a trigger?

Triggers enforce invariants on every write but add latency to every INSERT/UPDATE path. CHECKs have zero overhead until a violation occurs. For the patterns here (impossible states, not business-rule consistency), CHECKs are sufficient — the RPC covers the soft invariants that can't be expressed as row-level CHECKs.

---

## Scope

- Five `ALTER TABLE … ADD CONSTRAINT IF NOT EXISTS` — no schema changes.
- One new admin RPC `check_data_integrity()`.
- No API route changes — this PR is purely DB-layer hardening.
