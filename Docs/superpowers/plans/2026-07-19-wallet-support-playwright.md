# Wallet and Support Playwright E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add browser-level coverage for Wallet Settings, Wallet Approver management, payout reports, withdrawal receipts, and make the existing Playwright suite deterministic.

**Architecture:** Wallet browser tests will authenticate through the existing seeded demo-account flow, then intercept only the page APIs needed to isolate each UI contract from external Stripe/Gemini/Supabase state. Support Ticket will be tested against the real API and page rendering so a successful create response must produce the same subject in the detail view.

**Tech Stack:** Next.js App Router, React, Playwright, existing Vitest/API tests, Supabase-backed routes.

## Global Constraints

- Work only in the main repository.
- Do not alter Wallet, Stripe, KYC, catalogue, or user-management business behavior unless a failing browser test proves the UI contract is incorrect.
- Keep secrets, service keys, and real identity/bank data out of tests.
- Browser tests must use deterministic route fixtures for settings, approvers, reports, and receipt data; they must not issue real payout or email operations.
- Existing tests must remain runnable with `npx playwright test tests/e2e --workers=1`.

### Task 1: Stabilize Support Ticket browser assertions

**Files:**
- Modify: `tests/e2e/admin-user-management.spec.ts`
- Inspect: `app/api/support/tickets/route.ts`, `app/customer/support/[id]/page.tsx`

- [ ] Reproduce the real create/detail flow with one Playwright test and record the response subject and rendered heading.
- [ ] If the response is 201 and the detail API returns the same subject, use an exact heading locator; if it differs, fix the page/API serialization at its source.
- [ ] Keep the test asserting both ticket ID navigation and exact subject.
- [ ] Run the focused test and confirm it passes.

### Task 2: Add Wallet Settings and Approver UI E2E

**Files:**
- Create: `tests/e2e/wallet-governance.spec.ts`
- Exercise: `app/admin/wallet/settings/page.tsx`

- [ ] Login as the seeded Super Admin using the form-scoped submit button.
- [ ] Intercept `GET /api/admin/wallet-settings` and `GET /api/admin/wallet-approvers` with deterministic settings, approver, and eligible-user data.
- [ ] Assert all five settings are visible, change one value, enter a clean 10+ character reason, submit, and assert the PATCH request body plus success message.
- [ ] Enter a role reason, select an eligible user, grant access, assert the PATCH payload and refreshed approver row.
- [ ] Assert a short reason produces inline validation without a request.
- [ ] Run the focused spec with one worker.

### Task 3: Add payout report UI E2E

**Files:**
- Modify: `tests/e2e/wallet-governance.spec.ts`
- Exercise: `app/admin/reports/payouts/page.tsx`

- [ ] Intercept the payout report GET with deterministic MYT period and summary including failed, reserved, and withdrawn amounts.
- [ ] Navigate to `/admin/reports/payouts`, assert summary cards, choose a month, generate the report, and assert the query string.
- [ ] Click Export CSV and assert the downloaded file contains `amount_failed_rm`, `amount_reserved_rm`, and `amount_withdrawn_rm`.
- [ ] Run the focused spec.

### Task 4: Add withdrawal receipt UI E2E

**Files:**
- Modify: `tests/e2e/wallet-governance.spec.ts`
- Exercise: `app/customer/wallet/withdrawals/[id]/page.tsx`

- [ ] Login as seeded customer and intercept the receipt API with an owned safe receipt.
- [ ] Navigate to the receipt route and assert amount, status, masked payout reference, destination label, and customer-visible reason.
- [ ] Assert raw Stripe account/payout IDs and sensitive fields are not rendered.
- [ ] Run the focused spec.

### Task 5: Full verification

- [ ] Run `npx playwright test tests/e2e --workers=1 --reporter=line`.
- [ ] Run `npm test`, `npx tsc --noEmit`, and `git diff --check`.
- [ ] Report any remaining external-data failures separately from source/test failures; do not claim the suite is green without zero failed tests.
