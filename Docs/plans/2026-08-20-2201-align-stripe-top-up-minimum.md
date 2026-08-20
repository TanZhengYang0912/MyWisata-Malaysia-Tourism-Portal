# Align Stripe Top-up Minimum

**Status:** Complete

## Context

Stripe rejects MYR Checkout Sessions below RM2.00, while the wallet UI and `/api/stripe/create-checkout` currently accept RM1.00. A RM1.11 attempt therefore reaches Stripe, throws `amount_too_small`, and falls back to the generic `Failed to initiate top-up.` message.

## Decisions

- Use one shared Stripe top-up minimum for the browser and API.
- Reject amounts below RM2.00 before any Stripe customer/session call.
- Keep tier limits, phone verification, wallet settlement, and Stripe webhook behavior unchanged.
- Parameterize the translated minimum message so the displayed amount comes from the shared rule.

## Scope

### Files to modify

- `app/customer/wallet/page.tsx` — input minimum and submit validation.
- `app/api/stripe/create-checkout/route.ts` — server-side minimum validation.
- `app/i18n/locales/en/customer.json` — parameterized minimum message.
- `app/i18n/locales/zh-CN/customer.json` — parameterized minimum message.
- `app/i18n/locales/ms/customer.json` — parameterized minimum message.

### Files to create

- `lib/stripe/top-up-limits.ts` — shared Stripe MYR minimum constants.
- `app/api/stripe/create-checkout/__tests__/route.test.ts` — route boundary regression test.
- `app/customer/wallet/__tests__/stripe-top-up-minimum.test.ts` — UI/translation wiring contract.

### Files not being touched

- `app/api/stripe/webhook/route.ts`
- `app/api/wallet/summary/route.ts`
- `supabase/migrations/**`
- Checkout, withdrawal, KYC, and phone verification flows outside the existing top-up gate.

### Dependencies and database

- New dependencies: none.
- Database changes: none.

### Risks

- RM1.00–RM1.99 top-ups will no longer be accepted, matching Stripe's actual MYR Checkout constraint.

## Verification

- RED: prove RM1.99 currently reaches the Stripe session mock and the UI still declares a RM1 minimum.
- GREEN: prove RM1.99 returns 400 without calling Stripe and RM2.00 remains accepted.
- Run focused route and wallet tests.
- Run `npm run lint`, `npx tsc --noEmit`, the full Vitest suite, and `git diff --check`.

## Results

- RED confirmed the previous API accepted both RM1.99 and the rounding edge RM1.999.
- GREEN confirms RM1.99 and RM1.999 return 400 without a Stripe session call, while RM2.00 creates a mocked 200-sen line item.
- Focused regression tests: 2 files, 5 tests passed.
- Full Vitest suite: 416 files and 1771 tests passed; 7 files and 20 tests skipped.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with 56 pre-existing warnings and no errors.
- `npm run verify:i18n`: coverage/default-value checks passed; the existing project-wide i18next lint reported 46 non-blocking warnings.
- `git diff --check`: passed.
