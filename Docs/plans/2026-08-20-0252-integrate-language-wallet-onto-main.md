# Integrate Language and Wallet Features onto Latest Main Implementation Plan

> **For agentic workers:** Execute this plan on `codex/integrate-language-wallet-onto-main`. The latest `origin/main` is the architecture source of truth; `origin/feature/multiple-luanguage` is an implementation reference only.

**Status:** Approved for implementation by the user's 20 Aug 2026 request.

**Goal:** Preserve the completed multilingual, wallet/payment, authentication, customer-access, image fallback, and related user-visible behavior from `feature/multiple-luanguage` while retaining the latest `main` architecture and vendor-management UI.

**Architecture:** Start from commit `5759334` on `origin/main`. Port focused feature commits and final integration behavior module-by-module. For every conflict, retain the current Main component/data shape, then apply only the feature behavior, translation access, validation, or financial invariant. Never merge PR #15 or replace Main files wholesale merely to make conflicts disappear.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL, TailwindCSS, i18next/next-i18next/react-i18next, Stripe Sandbox, signed non-production payment simulators, Vitest, Playwright.

## Global Constraints

- Preserve current Main routing, component ownership, vendor-management architecture, design tokens, permissions, and API contracts unless a listed feature explicitly extends them.
- Supported locales are exactly `en`, `zh-CN`, and `ms`; English is the fallback and initial default.
- A valid `NEXT_LOCALE` cookie remains authoritative during sign-in and account switching. Account preference is used only when no valid cookie exists.
- Keep URLs locale-neutral. Translate system copy only; do not translate user/vendor content, IDs, enum payloads, or database values.
- Preserve the dual-bucket wallet model and integer sen arithmetic. All money movement remains database-atomic, idempotent, and server-authorized.
- Stripe remains official Sandbox integration. TNG/GrabPay/bank checkout and TNG direct-credit payout remain clearly labelled non-production simulators and fail closed in Production.
- Do not copy `.next`, coverage, reports, local PDFs, secrets, generated output, or old architecture-only files.
- Existing migrations are immutable. Add only feature-branch migrations not already represented on Main, in their established order.
- No direct merge or broad cherry-pick of merge commits `3926a83`, `c0e0389`, or `e2c2913`.

## Baseline

- Integration branch: `codex/integrate-language-wallet-onto-main`
- Base: `origin/main` at `5759334`
- Reference: `origin/feature/multiple-luanguage` at `e2c2913`
- Baseline verification: 357 test files passed, 7 skipped; 1329 tests passed, 20 skipped.

## Phase 1 — Internationalization Foundation

**Focused source commits:** `d534347`, `058eac0`, `6b5d6a4`, `4983245`, `b132f1b`, `21b2107`.

**Create:**

- `i18n.config.ts`
- `lib/i18n/locale.ts`
- `lib/i18n/resources.ts`
- `lib/i18n/server.ts`
- `lib/i18n/format.ts`
- `lib/i18n/__tests__/locale.test.ts`
- `lib/i18n/__tests__/resources.test.ts`
- `lib/i18n/__tests__/format.test.ts`
- `components/providers/i18n-provider.tsx`
- `app/api/locale/route.ts`
- `app/api/locale/__tests__/route.test.ts`
- `app/i18n/locales/en/{common,auth,customer,vendor,admin}.json`
- `app/i18n/locales/zh-CN/{common,auth,customer,vendor,admin}.json`
- `app/i18n/locales/ms/{common,auth,customer,vendor,admin}.json`
- `supabase/migrations/20260817234400_user_preferred_locale.sql`
- `supabase/migrations/__tests__/20260817234400_user_preferred_locale.test.ts`
- `app/__tests__/i18n-layout.contract.test.ts`
- `lib/supabase/__tests__/proxy-locale.test.ts`

**Modify:**

- `package.json`, `package-lock.json`
- `app/layout.tsx`
- `proxy.ts`, `lib/supabase/proxy.ts`
- `backend/core/types.ts`
- `components/providers/auth.tsx`

**Functions/components affected:** `resolveAppLocale`, `matchAcceptedLocale`, `loadLocaleResources`, `getRequestLocale`, `getServerTranslation`, `AppI18nProvider`, `POST /api/locale`, `updateSession`, `loadSupabaseUser`, `RootLayout`.

## Phase 2 — Language Controls, Authentication, and Account Switching

**Focused source commits:** `6b0f03d`, `fb69204`, `21aef1c`, `c0f8fa2`, `63cdfb4`, plus the role-aware callback/default-English fixes in `b699cf6`.

**Create:**

- `components/shared/language-switcher.tsx`
- `components/shared/__tests__/language-switcher.test.tsx`
- `components/shared/__tests__/language-entry-points.contract.test.ts`
- `app/__tests__/auth-lifecycle-i18n.contract.test.ts`
- `app/login/__tests__/role-aware-next.contract.test.ts`
- `app/auth/callback/__tests__/route.test.ts`

**Modify:**

- `app/login/page.tsx`
- `app/reset-password/page.tsx`
- `app/account-restore/page.tsx`
- `app/account-suspended/page.tsx`
- `app/auth/callback/route.ts`
- `app/customer/layout.tsx`
- `app/guest/layout.tsx`
- `components/layout/vendor-sidebar.tsx`
- `app/admin/layout.tsx`
- `components/profile/profile-sections.tsx`
- `app/outlet-manager-invitations/[token]/page.tsx`
- `app/vendor-invite/page.tsx`
- `components/vendor/vendor-invite-account-step.tsx`
- `components/vendor/vendor-invite-client.tsx`
- `components/vendor/vendor-invite-details-step.tsx`
- `components/vendor/vendor-invite-phone-step.tsx`
- `components/vendor/vendor-invite-wizard.tsx`
- `components/vendor/register-vendor-form.tsx`
- `app/api/auth/demo-signin/route.ts`
- `components/providers/auth.tsx`
- all five locale namespace files for each supported locale.

**Functions/components affected:** `LanguageSwitcher`, demo sign-in handler, Google/auth callback destination resolver, AuthProvider session hydration, all role shell navigation/footer controls.

## Phase 3 — Shared and Role UI Translation

**Focused source commits:** `afe41d4`, `6b14b2c`, `d8305a0`, `43c7744`, `c9f9e8f`, `78b3133`, `dd0ea11`, `b4521d7`, `e2cc132`, `72c298d`, `45d35bd`, `d038432`.

**Shared files:**

- `components/providers/action-feedback.tsx`
- `components/shared/empty-state.tsx`
- `components/shared/status-badge.tsx`
- `components/shared/notification-bell.tsx`
- `components/shared/notification-center.tsx`
- `components/shared/ticket-thread.tsx`
- `components/shared/chatbot-widget.tsx`
- `components/vendor/pagination-controls.tsx`
- `components/vendor/compact-filter-bar.tsx`
- `components/admin/segmented-filter.tsx`
- `components/admin/batch-action-bar.tsx`
- `components/admin/confirm-dialog.tsx`
- `lib/customer/header-navigation.ts`
- `lib/customer/discovery-categories.ts`
- `backend/domains/preferences.ts`

**Customer/guest scope:** every rendered `.tsx`/`.ts` file in `app/customer`, `app/guest`, `components/customer`, `components/guest`, `components/map`, `components/demo-map`, `components/outlet`, and the rendered profile components listed by `Docs/plans/2026-08-17-2344-sitewide-cookie-i18n.md` Task 7. Exact coverage is enforced by `app/customer/__tests__/sitewide-i18n.contract.test.ts` and the locale parity manifest.

**Vendor scope:** every rendered file in `app/vendor`, `components/vendor`, vendor-facing layout components, and vendor-facing shared analytics components listed by the source plan Task 8. Exact coverage is enforced by `app/vendor/__tests__/sitewide-i18n.contract.test.ts`.

**Admin scope:** all routes under `app/admin` and rendered components under `components/admin` listed by the source plan Task 9, including overview, vendor approvals, catalogue, users, KYC, withdrawals/refunds, wallet settings, payouts, recommendations, support, chat reports, affiliate, chatbot, rewards, and AI Assistant. Exact coverage is enforced by `app/admin/__tests__/sitewide-i18n.contract.test.ts`.

**Audit files:**

- `scripts/verify-i18n-coverage.mjs`
- `scripts/__tests__/verify-i18n-coverage.test.ts`
- `tests/e2e/sitewide-language-switching.spec.ts`
- `package.json` (`verify:i18n` only)

## Phase 4 — Wallet, Withdrawals, Payments, and Refunds

**Focused source commit:** financial and integration subset of `b699cf6` only.

**Database migrations and tests:**

- `supabase/migrations/{096_wallet_ledger_tng_mock_settlement,097_fix_withdrawal_review_sources,098_provider_neutral_withdrawal_completion,099_withdrawal_retry_safety_and_guidance,100_provider_event_settlement_backfill,101_stripe_destination_account_id_guard}.sql`
- `supabase/migrations/20260817040133_wallet_provisioning_and_topup_security.sql`
- `supabase/migrations/20260817172900_provider_simulator_payment_engineering.sql`
- the matching eight files under `supabase/migrations/__tests__/`.

**Domain/security files:**

- `lib/payments/{providers,simulator-config,simulator-webhook,settle-simulator-event}.ts`
- `lib/payments/__tests__/{providers,simulator-config,simulator-webhook,settle-simulator-event}.test.ts`
- `lib/payouts/{destinations,execute-approved-withdrawal,failures,tng-config,tng-webhook}.ts`
- `lib/payouts/providers/tng-direct-credit.ts`
- matching tests under `lib/payouts/__tests__/`
- `lib/stripe/{account-id,connect-status,jit-visibility}.ts`
- matching tests under `lib/stripe/__tests__/`
- `lib/checkout/idempotency.ts`, `lib/checkout/__tests__/idempotency.test.ts`
- `lib/validation/schemas.ts`
- `lib/wallet/withdrawal-review.ts`
- `scripts/verify-provider-neutral-withdrawals.mjs`
- `scripts/__tests__/verify-provider-neutral-withdrawals.test.ts`

**API files:**

- `app/api/checkout/{prepare,finalize,confirm-stripe}/route.ts` and focused tests
- `app/api/payments/simulator/sessions/[sessionId]/route.ts`
- `app/api/payments/simulator/sessions/[sessionId]/action/route.ts`
- `app/api/payments/simulator/refunds/[refundId]/action/route.ts`
- `app/api/payments/simulator/webhook/route.ts` and all focused tests
- `app/api/stripe/{webhook,connect-onboard,connect-status}/route.ts` and focused tests
- `app/api/tng/payout/webhook/route.ts` and test
- `app/api/wallet/destinations/route.ts`
- `app/api/wallet/withdrawals/route.ts`
- `app/api/wallet/withdrawals/[id]/receipt/route.ts` and focused tests
- `app/api/admin/withdrawals/[id]/{route,approve/route,retry-payout/route}.ts` and focused tests
- `app/api/admin/refunds/route.ts`
- `app/api/admin/refunds/[refundId]/route.ts` and focused tests
- `app/api/orders/[orderId]/refund/route.ts` and contract test

**UI files:**

- `app/customer/wallet/page.tsx`
- `app/customer/wallet/withdrawals/[id]/page.tsx`
- `app/customer/checkout/page.tsx`
- `app/customer/checkout/simulator/[sessionId]/page.tsx`
- `app/admin/withdrawals/page.tsx`
- `app/admin/refunds/page.tsx`
- `app/admin/layout.tsx`
- focused UI contract tests and `tests/e2e/{payment-provider-simulator,stripe-jit-withdrawal}.spec.ts`.

## Phase 5 — Remaining Feature-Branch Behavior

Port only confirmed behavior absent from Main:

- Customer/guest capability gates: `lib/auth/customer-capabilities.ts`, `lib/auth/guest-mode.ts`, `components/customer/use-customer-capability-gate.ts`, `components/customer/guest-account-empty-state.tsx`, anonymous-safe provider changes, and focused tests.
- Resilient media: `components/shared/resilient-image.tsx`, `components/shared/__tests__/resilient-image.contract.test.ts`, the exact customer/map/vendor image consumers identified by the branch diff, and `tests/e2e/customer-explore-image-fallback.spec.ts`.
- Route-boundary fixes: `components/customer/customer-calendar-view.tsx`, `components/customer/customer-orders-view.tsx`, thin `app/customer/calendar/page.tsx` and `app/customer/orders/page.tsx`, and their contract tests.
- Role-aware auth/account switching and Activity render fixes not already completed in Phase 2.
- `.gitignore`: retain only legitimate local/generated exclusions, including `Form2_Revised.pdf`; do not hide source, migrations, or fixtures.

Any branch-only UI that conflicts with an equivalent newer Main implementation is recorded as already satisfied or follow-up; it is not copied over the Main design.

## Files Explicitly Not Touched

- Main-only vendor architecture and pages with no missing feature behavior.
- Unrelated dark-mode, font-size, search-typewriter, chat conduct, catalogue, place, booking, and recommendation code already present on Main.
- Existing applied migration contents.
- User/vendor content, uploaded media, environment files, service keys, Stripe secrets, local PDFs, `.next`, coverage, and generated output.
- PR #15 history, backup branch, and original `feature/multiple-luanguage` worktree.

## Dependencies

- Add only `i18next`, `next-i18next`, and `react-i18next` at the versions already locked on the feature branch.
- No additional runtime dependency is approved.

## Database Changes

- Add `users.preferred_locale` through `20260817234400_user_preferred_locale.sql`.
- Add only the eight missing wallet/payment migrations listed in Phase 4 after confirming they are absent from Main and do not duplicate later Main migrations.
- Do not run remote migrations automatically; produce the ordered migration list for the user after repository verification.

## Risks and Conflict Rules

- **Architecture replacement:** Main wins structure; manually adapt translation/feature calls.
- **Auth regression:** preserve Supabase cookie refresh and role destination rules; test Google, demo, customer, outlet manager, admin, and account switch paths.
- **Locale drift:** valid cookie wins; test English selection across account switches and refresh.
- **Financial data loss/double credit:** database RPC and idempotency tests are mandatory before UI acceptance.
- **Migration overlap:** compare function/table signatures before adding each migration; stop on semantic duplication.
- **Sensitive data:** never expose service credentials, raw signatures, bank details, KYC documents, internal storage paths, or unscoped signed URLs.
- **Large translation surface:** parity/coverage tests are source of truth; no page is complete solely because English fallback works.

## Verification

1. Focused tests after each phase.
2. `npm run verify:i18n` and `npm run verify:withdrawal-db` when introduced.
3. All affected migration contract tests.
4. `npm test` once after the final code change.
5. `npm run lint`, `npx tsc --noEmit`, and `git diff --check`.
6. Focused Playwright suites where local environment supports them; otherwise report the exact external dependency.
7. One bounded, BLOCKING `luna_worker` security/privacy review before final handoff, covering locale cookie/auth, financial APIs/RPCs, signed simulator inputs, signed URLs, and internal storage paths.

## Delivery

- Commit only to `codex/integrate-language-wallet-onto-main`.
- Push the new branch and prepare a new PR into `main` after verification.
- Leave PR #15 open or close it as superseded only with the user's direction; never merge it into Main.
