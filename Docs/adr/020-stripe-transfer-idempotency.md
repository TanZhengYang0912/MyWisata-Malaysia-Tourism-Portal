# ADR-020: Stripe Transfer idempotency for withdrawal approval

**Status:** Accepted  
**PR:** 020 — `020_stripe_transfer_idempotency.sql`

---

## Context

The original withdrawal approve route called `stripe.transfers.create()` and `stripe.payouts.create()` in sequence, then wrote both IDs to the DB via `admin_set_processing`. If the server crashed or the DB call failed after Stripe had already charged, the withdrawal row remained in `status='approved'` with `stripe_transfer_id = NULL`. The admin's "Retry" button re-entered the same code path and called `stripe.transfers.create()` again — double transfer.

## Decision

Two complementary mechanisms, each independently sufficient for the 24-hour window:

### 1. Stripe idempotency keys (primary defence)

Both Stripe calls now carry deterministic idempotency keys derived from the withdrawal ID:

```
Transfer: idempotencyKey = `wr-{withdrawalId}-transfer`
Payout:   idempotencyKey = `wr-{withdrawalId}-payout`
```

Stripe deduplicates requests with the same key within 24 hours — any retry returns the original Transfer/Payout object rather than creating a new one. This is the canonical Stripe recommendation for preventing double charges.

### 2. Intermediate DB save after Transfer (secondary defence)

A new RPC `record_stripe_transfer(withdrawal_id, transfer_id)` is called immediately after `stripe.transfers.create()` succeeds and **before** `stripe.payouts.create()`. The approve route on retry checks `withdrawal.stripe_transfer_id`:

- If set → `stripe.transfers.retrieve()` (no Stripe charge)
- If null → `stripe.transfers.create()` with idempotency key

The same pattern applies to `stripe_payout_id`. This defence covers the edge case where Stripe's 24-hour idempotency window has expired but the withdrawal is still in `approved` status.

## Why both

| Scenario | Idempotency key | Intermediate save |
|---|---|---|
| Retry within 24 h | ✅ prevents double charge | ✅ skips create entirely |
| Retry after 24 h | ❌ new charge would occur | ✅ retrieves existing ID |
| Concurrent retries (race) | ✅ same result | ✅ `WHERE stripe_transfer_id IS NULL` is atomic |

## Scope

- `stripe_transfer_id` and `stripe_payout_id` columns already existed on `withdrawal_requests`.
- No schema changes needed beyond the new `record_stripe_transfer` RPC.
- `cancel_withdrawal` (called on reject) correctly refunds `earnings_sen` — verified in Gap 6 analysis.
