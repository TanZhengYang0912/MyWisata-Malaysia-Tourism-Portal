# ADR-023: Edge cases — rounding, vendor name dedup, Stripe expiry, payouts guard

**Status:** Accepted  
**PR:** 023 — `023_edge_cases.sql`

---

## Context

PR 023 closes the P3 (edge case) gap category across four domains:

**a. Money precision — half-up vs half-even rounding**  
`Math.round()` (JS) and `ROUND()` (PostgreSQL) both use half-up rounding: at exactly 0.5, always round up. Over a large number of commission calculations this creates a systematic upward bias. Banker's (half-even) rounding eliminates the bias by rounding to the nearest even integer at the midpoint.

**b. Vendor name deduplication — NFKC normalization**  
The previous duplicate check used `lower(vendor_name) = lower(p_vendor_name)`. This missed:
- Full-width characters: `Ａ` (U+FF21) renders identically to `A` but is a different codepoint.
- Zero-width character injection: inserting U+200B between characters splits the string visually without changing appearance.
- Ligatures: `ﬁ` (U+FB01) renders as `fi` but compares differently.

**d. Stripe idempotency window expiry**  
If the server crashes after `stripe.transfers.create()` succeeds but before `record_stripe_transfer` saves the ID, the retry path sees `stripe_transfer_id = NULL`. Within 24 h, Stripe's idempotency key deduplicates the create call. Beyond 24 h, Stripe treats it as a new request — creating a second transfer. There was no guard to detect this condition.

**f. Stripe Connect `payouts_enabled` pre-check**  
The approve route checked that a Connect account ID existed but not whether payouts were actually enabled on the account. A payout attempt on a restrictions-pending account produces a generic 502 Stripe error with no actionable guidance.

---

## Decisions

### a. `round_sen()` SQL function + `roundSen()` JS helper

**PostgreSQL** — `round_sen(p_amount_rm NUMERIC) RETURNS BIGINT`: computes `TRUNC(p_amount_rm * 100)`, inspects the remainder, and applies the half-even tie-break. Applied to `debit_withdrawal`.

**JavaScript** — `roundSen(rm: number): number` added to `lib/money.ts`: same algorithm using `Math.floor` and a fraction check. Applied to ongoing commission calculation in `attribution.ts` (replaces `Math.round(orderTotal * ONGOING_RATE * 100)`).

### b. `normalize_vendor_name()` + `vendor_name_normalized` stored key

**Normalization pipeline**: `normalize(input, NFKC)` → strip zero-width characters via `translate()` → `btrim` → collapse internal whitespace → `lower()`.

**Stored key approach (γ)**: the normalized key is stored in `vendor_recommendations.vendor_name_normalized` column. The duplicate check in `submit_recommendation` compares `vendor_name_normalized = normalize_vendor_name(p_vendor_name)` — one normalize call, backed by an index.

Index: `idx_rec_name_normalized ON vendor_recommendations(recommender_id, vendor_name_normalized) WHERE status NOT IN ('rejected')` — partial, so it only covers active recommendations and stays small.

**Why stored key over on-the-fly**: an expression index `ON (normalize_vendor_name(vendor_name))` would work but silently breaks if the function changes signature. A stored column is explicit, visible, and backfillable.

### d. Idempotency window expiry guard

In the approve route retry path (status = `approved`, `stripe_transfer_id IS NULL`):

```typescript
if (Date.now() - new Date(row.updated_at).getTime() > 24 * 3_600_000) {
  return { error: '...', code: 'idempotency_window_expired', retryable: false }  // 409
}
```

`updated_at` is set by trigger when status becomes `approved`. Because `record_stripe_transfer` sets `stripe_transfer_id` (which makes this check irrelevant), `updated_at` only reflects approval time when the transfer was never recorded — exactly the at-risk scenario.

### f. `payouts_enabled` pre-check

Before creating a new payout (guarded by `!row.stripe_payout_id`), the route calls `stripe.accounts.retrieve(connectAccountId)` and checks `account.payouts_enabled`. Returns 422 with `code: 'payouts_disabled'` and retryable: false if disabled. The extra Stripe API call is skipped on retry paths where the payout was already created.

---

## Scope

- **Migration**: 2 new SQL functions + 1 column + index + `submit_recommendation` rewrite + `debit_withdrawal` update.
- **`lib/money.ts`**: `roundSen()` export added.
- **`lib/affiliate/attribution.ts`**: ongoing commission uses `roundSen()`.
- **`app/api/admin/withdrawals/[id]/approve/route.ts`**: `updated_at` added to SELECT; expiry guard + payouts check added.
- No new tables, no RLS changes, no breaking changes to existing API contracts.
