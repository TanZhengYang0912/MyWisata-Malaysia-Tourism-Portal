# Finalize Full-Wallet Split Checkout

**Status:** Complete

## Context

`wallet_split` reserves wallet funds before determining whether Stripe needs to collect a remainder. When the wallet fully covers the order, the remainder is zero and no Stripe Checkout URL is returned. The browser currently treats that absence as an error, while the authenticated wallet finalizer rejects `wallet_split`; the reservation therefore cannot complete through the intended path.

## Decisions

- Preserve the existing partial-wallet path: it reserves wallet funds and creates Stripe Checkout only for a positive remainder.
- Treat a zero external remainder as a full internal-wallet settlement.
- Enforce that rule in PostgreSQL: an authenticated customer may finalize `wallet_split` only when its locked reservation covers the complete order and the corresponding external payment amount is zero.
- Reuse the existing order/session/payment finalization and reservation-commit trigger; do not let the browser assert external-provider success.

## Phases

1. Add failing regression tests for the browser's zero-remainder handoff and the forward migration's database boundary.
2. Add one forward Supabase migration that extends `finalize_customer_wallet_checkout` for only a fully covered `wallet_split` reservation.
3. Update the checkout client to call the existing authenticated finalizer when the server returns `externalAmountSen === 0`.
4. Run focused tests, type checking, lint, the full suite, and one independent final review.

## Files to modify

- `app/customer/checkout/page.tsx` — recognize the server-returned zero-remainder split as an internal wallet finalization.

## Files to create

- `supabase/migrations/20260821132100_finalize_full_wallet_split_checkout.sql` — forward-only RPC hardening for full-wallet split sessions.
- `supabase/migrations/__tests__/20260821132100_finalize_full_wallet_split_checkout.test.ts` — migration boundary contract.
- `app/customer/checkout/__tests__/wallet-split-full-coverage.contract.test.ts` — checkout handoff contract.
- `Docs/plans/2026-08-21-1321-finalize-full-wallet-split-checkout.md` — this plan.

## Files not being touched

- `app/api/checkout/confirm-stripe/route.ts`
- `app/api/stripe/**`
- `app/api/payments/simulator/**`
- existing migrations, schema tables, provider configuration, wallet top-up, refund, and withdrawal flows.

## Dependencies and database

- New dependencies: none.
- Database change: one forward migration redefines the existing authenticated RPC; no tables, columns, or existing balance data are changed.

## Risks

- Allowing all `wallet_split` sessions through the customer finalizer would let the browser bypass Stripe; the migration must allow only a zero external amount with a complete locked reservation.
- An incorrect condition could leave a reservation uncommitted or accidentally accept an externally payable checkout. Regression tests will require the exact server predicate.

## Verification

- RED/GREEN focused regression tests (2/2 passing after the implementation).
- `npx tsc --noEmit` (passed).
- `npm run lint` (0 errors; 56 pre-existing warnings).
- `npm test` (425 files passing, 7 skipped; 1,801 tests passing, 20 skipped).
- `git diff --check` (passed).
- Independent security and specification reviews completed; the specification review added missing regression assertions for authentication, ownership, and reservation status.
