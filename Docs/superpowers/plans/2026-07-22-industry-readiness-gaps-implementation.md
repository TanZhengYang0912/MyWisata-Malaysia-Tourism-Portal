# Industry Readiness Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the approved verification, payout destination, withdrawal review, payout failure, monthly report, and production-readiness gaps without changing the fixed Owner Account → Vendor → Outlet → Products/Bookings/Orders model.

**Architecture:** Extend the existing verification and wallet boundaries. Keep profile completion as a pure shared calculation, add a provider interface for Stripe Connect and TNG Direct Credit, persist immutable withdrawal/destination and failure snapshots, expose read-only review projections, and keep deployment-only settings behind explicit runtime gates. Existing Stripe, KYC, notification, wallet, and Cron flows remain the integration points.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase/Postgres migrations and RPCs, Supabase Auth/OAuth, Stripe Connect, TNG Direct Credit provider adapter, Vercel Cron, Gemini OCR, Vitest, Playwright.

## Global Constraints

- Preserve the existing ownership model: one Owner Account owns one Vendor; one Vendor can own multiple Outlets, Products, Bookings, and Orders.
- The five profile fields are equally weighted at 20%: Full Name, Profile Photo, Short Bio, City, Country.
- Short Bio is valid only at 30–200 characters, and the default avatar does not count as a completed photo.
- Withdrawal requires Phone Verified, KYC Approved, and a verified payout destination.
- TNG PINs are never accepted, stored, logged, emailed, or sent to client code.
- TNG production payout is disabled unless the approved TNG provider contract and production credentials are present.
- Existing Bank Account payout remains Stripe Connect; no bank-provider replacement is introduced.
- Provider operations are server-side, idempotent, and auditable.
- Failed payouts store normalized and redacted provider details; the first failure is not automatically retried.
- Approver review data is read-only and sensitive values are masked.
- OCR remains advisory and Admin approval remains the final KYC decision.
- Existing user-owned files in the worktree are not overwritten.

## File Map

| Unit | Responsibility |
|---|---|
| `lib/verification/eligibility.ts` | Five-field completion and protected-action predicates |
| `app/customer/profile/page.tsx` | Profile form and field-based completion display |
| `lib/payouts/destinations.ts` | Destination capability, masking, and display contract |
| `lib/payouts/providers.ts` | Provider interface and typed provider outcomes |
| `lib/payouts/providers/tng-direct-credit.ts` | TNG Direct Credit integration and configuration gate |
| `app/api/wallet/destinations/route.ts` | Destination listing and lifecycle operations |
| `app/api/wallet/withdrawals/route.ts` | Withdrawal submission and destination snapshot |
| `lib/wallet/approver-notifications.ts` | Approver recipient fan-out and notification snapshot |
| `app/admin/withdrawals/page.tsx` | Approver queue and review details |
| `app/api/admin/withdrawals/[id]/route.ts` | Secured review projection |
| `supabase/migrations/20260722000201_industry_payout_destinations.sql` | Destination lifecycle, snapshot, and failure columns |
| `supabase/migrations/20260722000202_withdrawal_review_sources.sql` | Read-only review source projections and RLS/RPC contracts |
| `supabase/migrations/20260722000203_payout_report_pending_amounts.sql` | Correct pending report fields and detail contract |
| `app/api/admin/reports/payouts/route.ts` | Report API contract |
| `app/admin/reports/payouts/page.tsx` | Report cards, pending amounts, and detail table |
| `app/api/stripe/connect-webhook/route.ts` | Stripe failure normalization and persistence |
| `app/api/tng/payout/webhook/route.ts` | TNG callback verification and failure/success mapping |
| `app/api/cron/wallet-maintenance/route.ts` | Cron authentication and maintenance execution |
| `README.md` | Production configuration and evidence checklist |

## Task 1: Display the real five-field Profile Completion percentage

**Files:**
- Modify: `app/customer/profile/page.tsx`
- Modify: `lib/verification/eligibility.ts` only if the current return type needs a stable display label
- Test: `lib/verification/__tests__/eligibility.test.ts`
- Test: `app/customer/profile/__tests__/profile-completion.test.tsx`

**Interfaces:**

```ts
export type ProfileCompletion = {
  percentage: 0 | 20 | 40 | 60 | 80 | 100;
  missing: Array<'full_name' | 'avatar' | 'bio' | 'city' | 'country'>;
  complete: boolean;
};

export function computeProfileCompletion(input: {
  fullName?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  city?: string | null;
  country?: string | null;
}): ProfileCompletion;
```

- [ ] **Step 1: Add the focused rendering test.** Render a profile with three completed fields and assert the page shows `60%`; render the Wizard's current step separately and assert it still shows the step percentage rather than replacing the field percentage.
- [ ] **Step 2: Run the focused tests.** Run `npx vitest run lib/verification/__tests__/eligibility.test.ts app/customer/profile/__tests__/profile-completion.test.tsx`. Expected: the new page assertion fails because the page has no field-based percentage.
- [ ] **Step 3: Wire the existing `computeProfileCompletion` result into the Profile page.** Use the same server-loaded profile values used by the Recommendation gate. Render `Profile completion: {percentage}%`, a progress bar with `aria-valuenow`, and the missing field labels. Keep the existing `Step X of 5` Wizard display as a separate element.
- [ ] **Step 4: Run tests and commit.** Run the focused Vitest command and `git diff --check`; expected result is PASS. Commit only the Profile files with `git commit -m "feat: show profile completion percentage"`.

## Task 2: Add the payout destination/provider contract and TNG lifecycle

**Files:**
- Modify: `lib/payouts/destinations.ts`
- Create: `lib/payouts/providers.ts`
- Create: `lib/payouts/providers/tng-direct-credit.ts`
- Modify: `app/api/wallet/destinations/route.ts`
- Modify: `app/api/wallet/withdrawals/route.ts`
- Modify: `app/customer/wallet/page.tsx`
- Create: `app/api/tng/payout/webhook/route.ts`
- Create: `lib/payouts/__tests__/tng-direct-credit.test.ts`
- Modify: `lib/payouts/__tests__/destinations.test.ts`
- Create: `supabase/migrations/20260722000201_industry_payout_destinations.sql`
- Create: `supabase/migrations/__tests__/20260722000201_industry_payout_destinations.test.ts`

**Interfaces:**

```ts
export type PayoutProviderName = 'stripe_connect' | 'tng_direct_credit';
export type PayoutDestinationType = 'bank_account' | 'e_wallet';

export type PayoutProvider = {
  name: PayoutProviderName;
  isConfigured(): boolean;
  verifyDestination(input: { phoneOrDuitNow: string }): Promise<{
    status: 'verified' | 'pending' | 'rejected';
    providerReference: string | null;
    maskedReference: string;
    reason: string | null;
  }>;
  createPayout(input: {
    withdrawalId: string;
    amountSen: number;
    providerReference: string;
    idempotencyKey: string;
  }): Promise<{ status: 'processing' | 'completed' | 'failed'; providerEventId: string | null; failure: ProviderFailure | null }>;
};

export type ProviderFailure = {
  code: string | null;
  message: string | null;
  category: 'invalid_destination' | 'account_disabled' | 'provider_rejected' | 'timeout' | 'not_configured' | 'unknown';
  retryable: boolean;
};
```

- [ ] **Step 1: Add failing contract tests.** Cover Stripe bank support, TNG capability, no PIN in accepted input types, masked TNG identifiers, missing TNG configuration returning `not_configured`, destination verification states, 24-hour cooldown, and immutable withdrawal destination snapshots.
- [ ] **Step 2: Run the tests.** Run `npx vitest run lib/payouts/__tests__/destinations.test.ts lib/payouts/__tests__/tng-direct-credit.test.ts supabase/migrations/__tests__/20260722000201_industry_payout_destinations.test.ts`. Expected: the new provider/lifecycle assertions fail.
- [ ] **Step 3: Add the additive migration.** Add destination `cooldown_until`, `verified_at`, `disabled_at`, and safe provider metadata columns; add withdrawal snapshot columns for destination type/provider/masked reference; add payout failure provider/category/code/message/event/timestamp/retryable columns. Add checks preventing TNG PIN-shaped fields or raw credential columns from being introduced. Preserve existing rows and Stripe data.
- [ ] **Step 4: Implement the provider interface.** Keep Stripe Connect as the existing bank provider. Implement TNG Direct Credit behind an environment/configuration gate. The TNG adapter must use the provider contract supplied during onboarding, send only the provider reference and amount, never accept a PIN parameter, redact provider messages, and return `not_configured` when credentials or endpoint configuration are absent.
- [ ] **Step 5: Implement destination lifecycle APIs.** `POST` verifies a Bank/TNG destination through the selected provider, stores only provider reference plus masked label, and sets `verified_at`; `PATCH` changes the active destination only after re-verification and sets `cooldown_until = now() + interval '24 hours'`; `GET` returns only safe display fields. Reject withdrawal submission when the destination is not verified or still in cooldown.
- [ ] **Step 6: Snapshot the selected destination in the withdrawal transaction.** Update `app/api/wallet/withdrawals/route.ts` and the withdrawal RPC so the request copies destination type/provider/masked reference/provider reference at creation. The snapshot is never updated by later destination changes.
- [ ] **Step 7: Add the TNG callback route.** Verify the provider signature using a server-side secret, map completed/failed callbacks to the withdrawal state machine, reject duplicate event IDs, and persist normalized failure data. The route must not accept client-supplied status transitions without a verified callback.
- [ ] **Step 8: Update wallet UI and run tests.** Show Bank Account and TNG eWallet only when the capability is configured; otherwise show a clear unavailable state. Never render a PIN field. Run the focused tests and `git diff --check`; commit with `git commit -m "feat: add verified payout destination providers"`.

## Task 3: Enrich Approver notifications and read-only review details

**Files:**
- Modify: `lib/wallet/approver-notifications.ts`
- Modify: `lib/wallet/__tests__/approver-notifications.test.ts`
- Modify: `app/api/wallet/withdrawals/route.ts`
- Modify: `app/api/admin/withdrawals/[id]/route.ts`
- Modify: `app/admin/withdrawals/page.tsx`
- Create: `lib/wallet/withdrawal-review-projection.ts`
- Create: `lib/wallet/__tests__/withdrawal-review-projection.test.ts`
- Create: `supabase/migrations/20260722000202_withdrawal_review_sources.sql`
- Create: `supabase/migrations/__tests__/20260722000202_withdrawal_review_sources.test.ts`

**Interfaces:**

```ts
export type WithdrawalReviewSnapshot = {
  withdrawalId: string;
  customer: { id: string; displayName: string; email: string | null };
  amountSen: number;
  requestTime: string;
  kycStatus: string;
  risk: { level: string; reasons: string[] };
  sourceTotals: { rewardSen: number; affiliateSen: number; otherSen: number };
  destination: { type: string; maskedReference: string };
};
```

- [ ] **Step 1: Add failing payload/projection tests.** Assert Email and In-app metadata contain every required snapshot field, redact KYC/TNG/Stripe secrets, and include a stable request ID. Assert the review projection returns paginated reward sources, affiliate sources, wallet ledger rows, related transactions, and fraud flags.
- [ ] **Step 2: Run focused tests.** Run `npx vitest run lib/wallet/__tests__/approver-notifications.test.ts lib/wallet/__tests__/withdrawal-review-projection.test.ts supabase/migrations/__tests__/20260722000202_withdrawal_review_sources.test.ts`. Expected: missing fields/projection assertions fail.
- [ ] **Step 3: Add secured database projection contracts.** Add read-only SECURITY DEFINER functions or views for the review page, enforce Admin/Approver role checks inside the function, return paginated rows, and keep ordinary users restricted to their own withdrawal. Do not add client update/delete policies for ledger, source, or fraud rows.
- [ ] **Step 4: Build the snapshot at submission time.** Resolve the customer display name, KYC status, risk snapshot, wallet source totals, and destination mask after the secured withdrawal RPC succeeds. Store the notification metadata as an immutable JSON snapshot and use the same snapshot for Email and In-app delivery.
- [ ] **Step 5: Expand Approver UI.** Add tabs or sections for Risk Summary, Reward Sources, Affiliate Sources, Wallet Ledger, Related Transactions, Fraud Flags, and Payout Destination. Use pagination and masked values; keep actions on the existing Approve/Reject/Hold routes.
- [ ] **Step 6: Run tests and commit.** Run the focused tests plus `npx tsc --noEmit`; expected result is PASS. Commit with `git commit -m "feat: enrich withdrawal approver review"`.

## Task 4: Persist provider failure details and enforce safe retry behavior

**Files:**
- Modify: `app/api/admin/withdrawals/[id]/approve/route.ts`
- Modify: `app/api/stripe/connect-webhook/route.ts`
- Modify: `app/api/tng/payout/webhook/route.ts`
- Modify: `app/api/admin/withdrawals/[id]/route.ts`
- Modify: `app/customer/wallet/withdrawals/[id]/page.tsx`
- Create: `lib/payouts/failures.ts`
- Create: `lib/payouts/__tests__/failures.test.ts`
- Modify: `supabase/migrations/20260722000201_industry_payout_destinations.sql`

**Interfaces:**

```ts
export function normalizeProviderFailure(input: {
  provider: 'stripe_connect' | 'tng_direct_credit';
  code?: string | null;
  message?: string | null;
}): ProviderFailure;
```

- [ ] **Step 1: Add failing normalization tests.** Cover Stripe and TNG error codes, message redaction, invalid destination/non-retryable classification, timeout/retryable classification, unknown fallback, and customer-safe message generation.
- [ ] **Step 2: Run focused tests.** Run `npx vitest run lib/payouts/__tests__/failures.test.ts app/api/stripe/connect-webhook/__tests__/route.test.ts`. Expected: failure fields and categories are absent or generic.
- [ ] **Step 3: Implement normalized failure storage.** Persist provider, event ID, redacted code/message, category, retryable, and timestamp in the withdrawal record or dedicated append-only payout events table. Store the provider event ID with a unique constraint so webhook retries are idempotent.
- [ ] **Step 4: Update Stripe and TNG transitions.** Map `payout.failed` and TNG failure callbacks through `normalizeProviderFailure`; update the withdrawal atomically, restore Reserved to Available exactly once, create the failure ledger/audit event, and notify the Customer with the safe message.
- [ ] **Step 5: Block automatic retry.** Mark the first failure as failed and expose an explicit Admin retry action only for `retryable = true`; require a fresh approval/idempotency key before calling a provider again. A duplicate provider event must not restore funds twice.
- [ ] **Step 6: Display the details safely and commit.** Approvers see the normalized provider code/category/retryable state; Customers see only the safe explanation. Run `npx vitest run lib/payouts app/api/stripe/connect-webhook app/api/tng/payout app/api/admin/withdrawals` and commit with `git commit -m "feat: record payout failure reasons"`.

## Task 5: Correct Monthly Report pending amounts and detail contract

**Files:**
- Modify: `supabase/migrations/086_payout_report_details.sql` or add the next additive migration `supabase/migrations/20260722000203_payout_report_pending_amounts.sql`
- Modify: `app/api/admin/reports/payouts/route.ts`
- Modify: `app/api/admin/reports/payouts/__tests__/route.test.ts`
- Modify: `app/admin/reports/payouts/page.tsx`
- Create: `app/api/admin/reports/payouts/__tests__/pending-amounts.test.ts`
- Modify: `supabase/tests/withdrawal_approval_governance.sql`

**Interfaces:**

```ts
export type MonthlyPayoutSummary = {
  pending_earnings_amount_rm: number;
  pending_withdrawal_amount_rm: number;
  reserved_amount_rm: number;
  available_amount_rm: number;
  payout_fees_rm: number;
  details: Array<{
    date: string;
    user_id: string;
    source: string;
    status: string;
    request_count: number;
    amount_rm: number;
    fee_rm: number;
  }>;
};
```

- [ ] **Step 1: Add failing report contract tests.** Assert the RPC/API returns both pending amounts, reserved/available totals, fees, and user/date/source detail; assert the UI renders the returned field names rather than `amount_reserved_rm` when it is absent.
- [ ] **Step 2: Run focused report tests.** Run `npx vitest run app/api/admin/reports/payouts/__tests__/route.test.ts app/api/admin/reports/payouts/__tests__/pending-amounts.test.ts`. Expected: pending amount contract fails because only count or the legacy reserved field is returned.
- [ ] **Step 3: Add the additive report fields.** Calculate Pending Earnings from rewards inside the clearance window and Pending Withdrawal from requests in approval/processing/overdue/hold states. Keep Reserved Amount as a separate wallet/request measure. Preserve Asia/Kuala_Lumpur period boundaries and idempotent report generation.
- [ ] **Step 4: Align API and UI types.** Validate the RPC response at the API boundary, map missing/null numeric values to `0` only when the database contract explicitly returns null, and render cards for Pending Earnings, Pending Withdrawal, Reserved, Available, Completed, and Fees. Keep detail rows grouped by user/date/source and include safe status/failure category.
- [ ] **Step 5: Run report tests and commit.** Run `npx vitest run app/api/admin/reports/payouts supabase/migrations/__tests__` and `git diff --check`; expected result is PASS. Commit with `git commit -m "fix: report pending payout amounts"`.

## Task 6: Verify production configuration and OAuth/OCR behavior

**Files:**
- Modify: `app/api/cron/wallet-maintenance/route.ts` only if the current authentication/status response is insufficient
- Modify: `app/api/internal/wallet-maintenance/route.ts` only if the current result needs explicit idempotency evidence
- Modify: `lib/verification/email-status.ts` if Google `email_verified` is not reflected by the current user profile sync
- Modify: `lib/kyc/ocr.ts` only if manual-review status is not explicit
- Modify: `README.md`
- Test: `app/api/cron/wallet-maintenance/__tests__/route.test.ts`
- Test: `app/api/internal/wallet-maintenance/__tests__/route.test.ts`
- Test: `lib/verification/__tests__/email-status.test.ts`
- Test: `app/api/kyc/upload/__tests__/route.test.ts`

- [ ] **Step 1: Add read-only configuration tests.** Assert the Cron endpoint rejects missing/wrong secrets, the maintenance operation is safe to repeat, Google OAuth users with a trusted verified-email claim are Email Verified but are not automatically Phone/KYC Verified, and missing OCR key produces manual-review status.
- [ ] **Step 2: Run focused tests before changing code.** Run `npx vitest run app/api/cron/wallet-maintenance app/api/internal/wallet-maintenance lib/verification/__tests__/email-status.test.ts app/api/kyc/upload`. Expected: tests identify only missing status/edge-case behavior; do not weaken existing auth.
- [ ] **Step 3: Make only necessary code adjustments.** Keep production configuration external: `CRON_SECRET`, Supabase Confirm Email, Google OAuth, `GOOGLE_AI_KEY`, and TNG credentials are not committed. Add safe configuration status categories to the maintenance/health response if needed, never values. Preserve OCR manual fallback and native Supabase confirmation as sources of truth.
- [ ] **Step 4: Add the deployment checklist to README.** Document Vercel Production `CRON_SECRET`, Cron binding, Supabase Confirm Email and redirect URLs, Google OAuth, TNG provider credentials, Gemini key, Stripe webhook secret, and a smoke-test sequence. Do not document secret values.
- [ ] **Step 5: Run tests and commit.** Run the focused tests, `npx tsc --noEmit`, and commit with `git commit -m "docs: define production verification checklist"` if only documentation/config checks changed.

## Task 7: Run Inline Acceptance Checkpoints

**Files:**
- Create: `tests/e2e/industry-readiness-gaps.spec.ts`
- Modify: `playwright.config.ts` only if the current test environment cannot select the existing seeded demo accounts
- Modify: `README.md` with final evidence commands

- [ ] **Checkpoint A: Profile and verification.** Run `npx vitest run lib/verification app/customer/profile app/api/recommendations app/api/phone app/api/kyc`; then run the focused Playwright Wizard test. Evidence: Profile shows field percentage, Wizard shows step progress, Google/email verification remains tier-correct, and OCR fallback is labelled.
- [ ] **Checkpoint B: Payout destinations and wallet.** Run `npx vitest run lib/payouts app/api/wallet/withdrawals app/api/wallet/destinations app/api/checkout`; use the TNG mock only in test mode. Evidence: no PIN field/parameter, verified destination lifecycle, snapshot, split-payment reservation, and no duplicate debit.
- [ ] **Checkpoint C: Withdrawal review and failures.** Run `npx vitest run lib/wallet app/api/admin/withdrawals app/api/stripe/connect-webhook app/api/tng/payout`; evidence: all approvers receive the same redacted snapshot, review sections are read-only, failure reason is visible to the correct role, and funds restore exactly once.
- [ ] **Checkpoint D: Reports and operations.** Run `npx vitest run app/api/admin/reports/payouts app/api/cron/wallet-maintenance app/api/internal/wallet-maintenance`; then perform the configured Vercel/Supabase smoke checks. Evidence: both pending amounts render, Cron logs show a real run, Supabase Confirm Email is enabled, `GOOGLE_AI_KEY` is present, and TNG is either configured and tested or visibly gated as unavailable.
- [ ] **Checkpoint E: Full verification.** Run `npx vitest run`, `npx playwright test --workers=1`, `npx tsc --noEmit`, `npm run lint`, and `git diff --check`. Record any pre-existing failure separately; do not claim completion without passing the relevant focused suites.

## Execution Order and Checkpoints

Inline execution will proceed in this order:

1. Task 1, then Checkpoint A.
2. Task 2, then Checkpoint B.
3. Task 3, then Checkpoint C.
4. Task 4 and Task 5, then Checkpoint D.
5. Task 6, then the external production checks.
6. Task 7, then full verification.

After each task, stop if a migration contract, provider credential, or test result blocks the next task. Do not mark the plan complete until code tests and the required production evidence are both available.

