# Alice Wallet Demo History Design

**Status:** Approved in conversation on 2026-09-05

## Context

The customer Wallet already supports Withdrawal, Refund, and Adjustment filters, but the remote demo data contains none of those records for Alice. Alice currently has real customer-linked orders and two earnings ledger entries. The Wallet ledger is append-only and all balance-changing writes must use governed database procedures.

The goal is to give Alice coherent demo history for all three categories without inserting arbitrary ledger rows, leaking another customer's data, or leaving her Wallet balance artificially inflated.

## Decisions

### Alice eligibility

Promote Alice through the existing KYC workflow using non-sensitive demo evidence. Upload two tiny neutral fixture images to the private KYC bucket because the governed finalization RPC requires both document sides; they contain no identity data and their storage paths must never be logged or exposed. Use deterministic hashes and clearly labelled demo OCR metadata. Create a verified demo payout destination through the existing governed path so the withdrawal request satisfies the same checks as a real request.

### Withdrawal history

Use the existing admin adjustment RPC to add the minimum earnings required for the scenario. Sign in as Alice and submit a real withdrawal through `submit_wallet_withdrawal`. Sign in as the seeded Super Admin and reject the request through `reject_wallet_withdrawal`, creating both the debit reservation and credit return records. Apply a matching adjustment debit afterward so the scenario has no lasting net effect on Alice's available balance.

Every step must check for its deterministic marker or linked record before executing so rerunning the seed does not duplicate money movements.

### Refund history

Choose one deterministic Alice `mock_card` order that already has a successful payment and is suitable for refunding. Create a processed refund linked to that exact payment and order, then set the payment and order to their refunded states. The Wallet read model will project the original purchase as a debit and the processed external refund as a credit. External refunds must not change Wallet balance because the original payment did not use Wallet funds.

### Adjustment history

Use `apply_wallet_adjustment` as the only write path. Create one small earnings credit and one equal earnings debit with distinct demo marker reasons. Both entries remain visible and audited while their net balance effect is RM0.

## Components

- Extend `scripts/lib/vendor-customer-demo.mjs` with deterministic selection and planning helpers for Alice's refund scenario and stable marker values.
- Extend `scripts/seed-all-vendor-customer-demo.mjs` to authenticate the seeded Alice and Super Admin accounts, run governed KYC/Wallet RPCs, create the linked refund state, and resume safely after a partial failure.
- Extend `scripts/verify-all-vendor-customer-demo.mjs` to verify Alice has customer-owned Withdrawal, Refund, and Adjustment history, all links resolve, and Wallet balance reconciles with the ledger.
- Extend `backend/domains/commerce.ts` so customer Wallet history merges processed external refunds with ledger rows and purchase projections. Refunded orders remain visible as their original Purchase debit to preserve the full financial story.
- Update focused tests for planning, script contracts, merged pagination/filtering, and timezone-safe ordering.

## Data Flow

1. The normal vendor/customer seed creates Alice's orders and successful payments.
2. One stable Alice order/payment pair becomes the external refund scenario.
3. Alice's KYC and payout prerequisites are satisfied through existing controlled workflows.
4. Governed RPCs generate adjustment and withdrawal ledger entries with audit records.
5. The customer history query merges Wallet ledger, purchases, and processed external refunds, sorts the combined result by actual timestamp, then paginates.
6. Existing filters select `withdrawal_*`, `refund`, or `adjustment_*` types without UI changes.

## Error Handling and Idempotency

- The seed refuses to run without the existing explicit remote-write environment flag.
- Stable refund IDs and marker reasons identify completed steps.
- Before every non-idempotent Wallet RPC, the script reads the corresponding marker or linked row and skips completed work.
- If only the first half of a paired adjustment exists, rerunning performs only the missing compensating half.
- Any contradictory partial state aborts with an actionable error rather than guessing or overwriting unrelated data.
- No direct insert, update, or delete is performed on `wallet_transactions`.

## Scope Boundaries

- Alice is the only customer whose KYC state is intentionally promoted by this scenario.
- No production checkout, payout-provider, refund-provider, moderation, Wallet schema, or UI component behavior is changed.
- No real provider payout or Stripe refund is attempted.
- No service-role query is added to the customer page.
- No real identity document or payout credential is created, and private fixture paths are never printed.

## Verification

- Observe new unit and contract tests fail before implementation and pass afterward.
- Run focused Wallet and vendor/customer demo suites, TypeScript, lint, and full Vitest.
- Run the remote seed once and rerun it to prove idempotency.
- Verify Alice has at least one visible record in each of Withdrawal, Refund, and Adjustment filters.
- Verify the refund belongs to Alice's real order and payment.
- Verify withdrawal rows share one withdrawal request and use opposite reserve/return directions.
- Verify the paired adjustments net to zero and the Wallet reconciliation check reports no imbalance.
- Confirm through the browser that all three filters render non-empty results for Alice.
