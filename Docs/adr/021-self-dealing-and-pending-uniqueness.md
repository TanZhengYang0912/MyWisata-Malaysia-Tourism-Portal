# ADR-021: Self-dealing prevention, minimum withdrawal, and pending uniqueness

**Status:** Accepted  
**PR:** 021 — `021_semantic_validation_and_idempotency.sql`

---

## Context

PR 021 closes two remaining Sys-Arch gap categories:

**P0 — Semantic validation gaps**

1. **Self-dealing (5 admin RPCs):** None of the admin RPCs checked whether the acting admin was the owner of the resource being reviewed. An admin who is also a member could approve their own withdrawal request, review their own KYC, or approve their own vendor recommendation — each a separation-of-duties violation.

2. **Minimum withdrawal:** `debit_withdrawal` accepted any positive amount. The UI had a client-side RM 50 guard but the RPC had no server-side floor. Any direct API call bypassed the UI check.

3. **Vendor active-window uniqueness:** `admin_link_vendor_recommendation` could open a second active commission window for the same vendor while the first was still live, creating overlapping attribution periods.

**P1 — Remaining idempotency**

4. **Pending withdrawal uniqueness:** A user could submit multiple withdrawal requests before any was processed. The wallet debited on each request, so three pending withdrawals would deduct 3× from `earnings_sen` against the same funds (only the first debit was valid).

---

## Decisions

### 1. Self-dealing: `self_dealing` exception in all 5 admin RPCs

All five RPCs now raise `self_dealing` if `auth.uid()` matches the resource owner:

| RPC | Owner column compared |
|---|---|
| `record_admin_approval` | `withdrawal_requests.user_id` |
| `admin_reject_withdrawal` | `withdrawal_requests.user_id` (via RETURNING) |
| `admin_review_kyc` | `p_user_id` parameter |
| `admin_review_recommendation` | `vendor_recommendations.recommender_id` |
| `admin_link_vendor_recommendation` | `vendor_recommendations.recommender_id` |

The check is placed **after** `is_admin()` — a non-admin cannot determine whether a resource is their own through timing. Routes map `self_dealing` → HTTP 403.

### 2. Minimum withdrawal: `platform_settings.withdrawal.min_amount_sen`

`debit_withdrawal` reads `withdrawal.min_amount_sen` from `platform_settings` (fallback: 1000 sen = RM 10). The min check fires before the wallet lock, so no `FOR UPDATE` overhead on rejected calls.

Seed value: 1000 (RM 10). Configurable without a migration.

### 3. Vendor active-window uniqueness

`admin_link_vendor_recommendation` acquires `pg_advisory_xact_lock(hashtext('vendor_link:' || vendor_id))` before checking:

```sql
IF EXISTS (
  SELECT 1 FROM recommendation_conversions
   WHERE converted_vendor_id = p_vendor_id
     AND attribution_ends_at > now()
) THEN RAISE EXCEPTION 'vendor_already_linked';
```

The advisory lock prevents a race where two admins concurrently link the same vendor and both pass the EXISTS check before either commits. The lock is scoped to the vendor, so other vendors are unaffected.

Route maps `vendor_already_linked` → HTTP 409 with a human-readable message.

### 4. Pending withdrawal uniqueness: partial unique index

```sql
CREATE UNIQUE INDEX uniq_pending_withdrawal_per_user
  ON withdrawal_requests (user_id)
  WHERE status = 'pending';
```

`debit_withdrawal` wraps the INSERT in an exception handler:

```sql
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'pending_withdrawal_exists';
```

This is atomically correct — the same guarantee as Level 1 idempotency in PR 019. A concurrent second request cannot slip between the check and the insert because the unique index is the check. The `earnings_sen` debit only runs after the INSERT succeeds.

---

## Why not a CHECK constraint for pending uniqueness?

A CHECK constraint cannot reference other rows. A unique index can. The partial index is the canonical PostgreSQL pattern for "at most one row per user in state X."

## Scope

- No new tables or columns.
- `admin_reject_withdrawal` refactored to atomic status transition (UPDATE + RETURNING) before the self-dealing check, eliminating the original read-then-update TOCTOU window.
- `cancel_withdrawal` is still called after status is already `rejected` — harmless because it only touches the wallet, not the withdrawal status.
