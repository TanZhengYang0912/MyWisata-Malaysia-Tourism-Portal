# Wallet Hold/Resume Moderation and Customer Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Wallet Hold a recoverable, audited workflow with Wallet-specific Gemini validation, Support-driven customer follow-up, a fresh approval cycle on Resume, and a paginated customer notification center with email delivery for every customer-impacting Wallet event.

**Architecture:** Keep the database as the security boundary. Add a `resume_wallet_withdrawal` SECURITY DEFINER RPC and replace the existing Hold/Reject/Approve governance functions in a new forward migration (`079_...`) rather than editing already-run migrations. Keep Bio/Support moderation separate from Wallet-reason moderation. Use deterministic event keys for both in-app notifications and the email outbox so retries and duplicate webhooks are idempotent.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/Postgres RPCs and RLS, Gemini moderation through `lib/moderation.ts`, existing email outbox/Resend integration, Vitest, Playwright.

## Global Constraints

- Do not edit or rename existing migrations; add the next numeric migration as `079_wallet_hold_resume_notifications.sql`.
- Do not weaken RLS or move Wallet state transitions into client-side updates.
- All Wallet admin reasons require a fixed action-specific category plus a 10–500 character explanation.
- Wallet moderation must fail closed: unavailable or malformed Gemini output returns an error and performs no mutation.
- Bio/Support/Appeal text keeps the existing six-category moderation policy; Support ticket content remains mask-and-allow, not block.
- Hold preserves the reserved amount; Reject releases it; Resume preserves it and starts a new approval cycle.
- Customer-impacting Wallet events create one in-app notification and one deduplicated email outbox event.
- Guest users must not access personal notifications.
- Default notification page size is exactly 15.

---

### Task 1: Add the Wallet state, reason, notification, and moderation-attempt schema

**Files:**
- Create: `supabase/migrations/079_wallet_hold_resume_notifications.sql`
- Test: `supabase/migrations/__tests__/079_wallet_hold_resume_notifications.test.ts`

**Interfaces:**
- Produces `withdrawal_requests.approval_cycle INTEGER NOT NULL DEFAULT 1`.
- Produces `withdrawal_requests.customer_reason_category TEXT`.
- Produces `withdrawal_approvals.approval_cycle INTEGER NOT NULL DEFAULT 1`.
- Produces `withdrawal_approvals.reason_category TEXT` and allows action `resume`.
- Produces `support_tickets.withdrawal_id UUID NULL`.
- Produces nullable `notifications.event_key`, `notifications.category`, and `notifications.metadata` with a unique partial index on non-null event keys.
- Produces `wallet_moderation_attempts` containing actor, withdrawal, action, category, result, model categories, timestamp, and no raw reason text.
- Extends `email_outbox.event_type` for `withdrawal_hold`, `withdrawal_resumed`, `withdrawal_rejected`, `topup_failed`, `topup_refunded`, `wallet_adjustment`, `payout_account_connected`, `payout_account_disconnected`, `recommendation_reward_pending`, `recommendation_reward_available`, and `recommendation_reward_reversed`.

- [ ] **Step 1: Write failing migration contract assertions**

Assert that the migration text contains all required columns, the `resume` action, the partial unique notification event-key index, the service-only moderation-attempt policy, the support-ticket foreign key, and the expanded email event check.

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `npx vitest run supabase/migrations/__tests__/079_wallet_hold_resume_notifications.test.ts`

Expected: FAIL because `079_wallet_hold_resume_notifications.sql` does not exist.

- [ ] **Step 3: Write the migration**

Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, drop/recreate only the named status/action/event check constraints, and backfill existing approval rows with cycle `1`. Add:

```sql
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS approval_cycle INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS customer_reason_category TEXT;

ALTER TABLE public.withdrawal_approvals
  ADD COLUMN IF NOT EXISTS approval_cycle INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reason_category TEXT;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS withdrawal_id UUID REFERENCES public.withdrawal_requests(id) ON DELETE SET NULL;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event_key TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_key_unique
  ON public.notifications(event_key) WHERE event_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.wallet_moderation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES public.users(id),
  withdrawal_id UUID REFERENCES public.withdrawal_requests(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('hold','reject','resume','approve','fraud_override','adjustment','settings','approver_role')),
  reason_category TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('accepted','flagged','irrelevant','unavailable','invalid')),
  model_categories TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_moderation_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_moderation_attempts_service_only ON public.wallet_moderation_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

Replace the email-outbox check with the complete `TransactionEmailType` union used by `lib/email/templates.ts`, and update the claim function from `attempts < 3` to `attempts < 5` with exponential retry scheduling retained in the outbox worker.

- [ ] **Step 4: Run the migration contract test**

Run: `npx vitest run supabase/migrations/__tests__/079_wallet_hold_resume_notifications.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the schema slice**

```powershell
git add supabase/migrations/079_wallet_hold_resume_notifications.sql supabase/migrations/__tests__/079_wallet_hold_resume_notifications.test.ts
git commit -m "feat: add wallet hold resume notification schema"
```

---

### Task 2: Split Bio moderation from Wallet-reason moderation

**Files:**
- Modify: `lib/moderation.ts`
- Modify: `lib/moderation.test.ts`
- Create: `lib/validation/wallet-reason-schemas.ts`
- Test: `lib/validation/wallet-reason-schemas.test.ts`

**Interfaces:**
- Keep `moderateBio()` and ordinary account moderation on the existing six-category policy.
- Add `WalletReasonAction = 'hold' | 'reject' | 'resume' | 'approve' | 'fraud_override' | 'adjustment' | 'settings' | 'approver_role'`.
- Add `WalletModerationResult = { flagged: boolean; relevant: boolean; categories: string[] } | { error: 'api_unavailable' }`.
- Add `moderateWalletReason(text, action, category)`; it must ask Gemini to assess relevance to the selected Wallet action/category and prohibited content, not whether the underlying account decision is factually true.
- Add `walletReasonSchema` requiring `reasonCategory` from the action-specific allowlist and `reason` trimmed to 10–500 characters.

- [ ] **Step 1: Write failing unit tests**

Cover: all allowed category lists, missing category, short reason, overlong reason, clean relevant text, irrelevant text, flagged text, unavailable API, malformed JSON, and preservation of `moderateBio()`'s existing prompt/category behavior.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx vitest run lib/moderation.test.ts lib/validation/wallet-reason-schemas.test.ts`

Expected: FAIL for the new Wallet API and schemas.

- [ ] **Step 3: Implement the policy split**

Use action-specific prompt text and strict JSON:

```json
{"flagged":false,"relevant":true,"categories":[]}
```

Reject Wallet text when `flagged === true` or `relevant === false`; return `api_unavailable` for timeout, non-2xx, missing candidate, or invalid JSON. Do not change the Bio/Support policy.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run lib/moderation.test.ts lib/validation/wallet-reason-schemas.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add lib/moderation.ts lib/moderation.test.ts lib/validation/wallet-reason-schemas.ts lib/validation/wallet-reason-schemas.test.ts
git commit -m "feat: add wallet-specific reason moderation"
```

---

### Task 3: Replace withdrawal governance RPCs and add Resume

**Files:**
- Modify: `supabase/migrations/079_wallet_hold_resume_notifications.sql`
- Modify: `app/api/admin/withdrawals/[id]/hold/route.ts`
- Modify: `app/api/admin/withdrawals/[id]/reject/route.ts`
- Modify: `app/api/admin/withdrawals/[id]/approve/route.ts`
- Create: `app/api/admin/withdrawals/[id]/resume/route.ts`
- Test: `app/api/admin/withdrawals/[id]/hold/__tests__/route.test.ts`
- Test: `app/api/admin/withdrawals/[id]/reject/__tests__/route.test.ts`
- Create: `app/api/admin/withdrawals/[id]/resume/__tests__/route.test.ts`
- Modify: `app/api/admin/withdrawals/[id]/approve/__tests__/route.test.ts`

**Interfaces:**
- `POST /api/admin/withdrawals/:id/resume` accepts `{ reasonCategory, reason }` and returns `{ status: 'pending', approvalCycle: number }`.
- `hold_wallet_withdrawal(p_id, p_reason_category, p_reason, p_ip)` preserves the reserve, writes `hold`, stores customer-visible category/reason, inserts `withdrawal_held`, and emits deterministic event key `withdrawal:hold:<id>:<cycle>`.
- `reject_wallet_withdrawal(p_id, p_reason_category, p_reason, p_ip)` releases the exact reserve once, writes `rejected`, and emits `withdrawal:rejected:<id>:<cycle>`.
- `resume_wallet_withdrawal(p_id, p_reason_category, p_reason, p_ip)` is allowed only from `hold`, requires an approver, increments `approval_cycle`, resets status to `pending`, preserves the old approval rows, writes a `resume` row for the new cycle, and emits `withdrawal:resumed:<id>:<newCycle>`.
- `approve_wallet_withdrawal` only counts `approve` rows for the current `approval_cycle` and only accepts `pending`/`pending_second_approval`.

- [ ] **Step 1: Add failing route tests**

Assert category is required, short reasons stop before moderation/RPC, flagged and irrelevant Wallet text return `422`, unavailable Gemini returns `503`, clear errors are returned to the UI, and no mutation/email occurs on failure. Resume tests must assert only `hold` is accepted.

- [ ] **Step 2: Add failing SQL contract tests**

Assert `resume_wallet_withdrawal` checks approver/self-dealing/status, increments cycle, does not change wallet balances, and that Approve counts only the current cycle.

- [ ] **Step 3: Implement RPCs and routes**

Use the existing `SECURITY DEFINER`, `search_path = public`, row locks, self-dealing checks, audit inserts, notification inserts, and email enqueue pattern. Never update withdrawal status directly from React.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run app/api/admin/withdrawals/[id]/hold/__tests__/route.test.ts app/api/admin/withdrawals/[id]/reject/__tests__/route.test.ts app/api/admin/withdrawals/[id]/resume/__tests__/route.test.ts app/api/admin/withdrawals/[id]/approve/__tests__/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add supabase/migrations/079_wallet_hold_resume_notifications.sql app/api/admin/withdrawals
git commit -m "feat: make wallet holds resumable with fresh approval cycles"
```

---

### Task 4: Apply Wallet moderation to every Wallet admin action

**Files:**
- Modify: `app/api/admin/withdrawals/[id]/fraud-override/route.ts`
- Modify: `app/api/admin/wallet-adjustments/route.ts`
- Modify: `app/api/admin/wallet-settings/route.ts`
- Modify: `app/api/admin/wallet-approvers/route.ts`
- Modify: their existing `__tests__/route.test.ts` files

**Interfaces:**
- Every route validates `reasonCategory` plus `reason` with `walletReasonSchema`.
- Every route calls `moderateWalletReason` with its action and category.
- Failure messages are action-specific and safe to show directly:
  - `The reason contains disallowed content.`
  - `Please explain a specific Wallet-related reason.`
  - `Content review is temporarily unavailable; please try again.`
- Accepted actions write a `wallet_moderation_attempts` row with metadata only.
- Each route enforces five attempts per actor/action/withdrawal in a rolling ten-minute window and returns `429` when exceeded.

- [ ] **Step 1: Add failing tests for every route**

Cover category mismatch, irrelevant text, moderation outage, rate limit, successful RPC payload, and no mutation on failure.

- [ ] **Step 2: Implement shared validation and attempt recording**

Use a service-role helper only for writing the metadata-only moderation attempt after the moderation result and before the governed RPC. Do not store raw reason text in the attempts table.

- [ ] **Step 3: Run focused route tests**

Run: `npx vitest run app/api/admin/withdrawals app/api/admin/wallet-adjustments app/api/admin/wallet-settings app/api/admin/wallet-approvers`

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add app/api/admin/withdrawals/[id]/fraud-override app/api/admin/wallet-adjustments app/api/admin/wallet-settings app/api/admin/wallet-approvers lib/validation/wallet-reason-schemas.ts
git commit -m "feat: enforce wallet reason categories across admin actions"
```

---

### Task 5: Add Support linkage for held withdrawals

**Files:**
- Modify: `app/api/support/tickets/route.ts`
- Modify: `app/api/support/tickets/[id]/route.ts` if present, otherwise create the existing ticket-detail route used by `app/customer/support/[id]/page.tsx`
- Modify: `app/customer/support/page.tsx`
- Modify: `app/customer/support/[id]/page.tsx`
- Modify: `app/customer/wallet/page.tsx`
- Test: existing support route tests and a new `app/api/support/tickets/__tests__/withdrawal-link.test.ts`

**Interfaces:**
- Support ticket creation accepts optional `withdrawalId`.
- Server verifies the withdrawal belongs to the authenticated Customer before storing the link.
- Wallet Hold notification links to `/customer/support/new?withdrawalId=<id>` or the existing support composer route.
- The composer pre-fills the withdrawal context but never pre-fills or requests identity documents in an email.
- Admin withdrawal detail shows the linked Support Ticket and latest customer reply.

- [ ] **Step 1: Add failing ownership and linkage tests**

Assert a Customer can link only their own held withdrawal, a different Customer gets `403`, and an unrelated or terminal withdrawal is rejected.

- [ ] **Step 2: Implement the link and UI**

Keep existing Support mask-and-allow moderation. Add a clear Hold banner on Wallet: `Additional information is required` and a `Provide information` CTA.

- [ ] **Step 3: Run tests**

Run: `npx vitest run app/api/support/tickets/__tests__/withdrawal-link.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add app/api/support app/customer/support app/customer/wallet
git commit -m "feat: link held withdrawals to customer support"
```

---

### Task 6: Build the customer notification API and Notification Panel

**Files:**
- Create: `app/api/notifications/route.ts`
- Create: `app/api/notifications/[id]/read/route.ts`
- Create: `app/api/notifications/read-all/route.ts`
- Create: `app/customer/notifications/page.tsx`
- Create: `components/customer/notification-panel.tsx`
- Modify: `app/customer/layout.tsx`
- Test: `app/api/notifications/__tests__/route.test.ts`
- Test: `components/customer/__tests__/notification-panel.test.tsx`

**Interfaces:**
- `GET /api/notifications?filter=all|unread|wallet|bookings|recommendations|support|account&page=1&pageSize=15` returns `{ items, page, pageSize: 15, total, unreadCount }`.
- `POST /api/notifications/:id/read` marks only the authenticated user's notification.
- `POST /api/notifications/read-all` marks all authenticated user's notifications.
- RLS and server queries always scope by `user_id = auth.uid()`.

- [ ] **Step 1: Write failing API/UI contract tests**

Cover default latest-15 ordering, every filter, unread count, ownership, mark-one, mark-all, guest `401`, and the `View all` link.

- [ ] **Step 2: Implement API routes**

Use server-side filtering and pagination. Never fetch all notifications into the browser. Return human-readable category labels and sanitized metadata only.

- [ ] **Step 3: Implement the panel and page**

Add a Bell icon immediately to the left of the Cart icon in both desktop and mobile customer navigation. The panel shows 15 newest rows, unread styling, `Mark all as read`, filters, and `View all notifications`. Do not mark all as read merely because the panel opened. Hide the icon for Guest Mode.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run app/api/notifications/__tests__/route.test.ts components/customer/__tests__/notification-panel.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/api/notifications app/customer/notifications app/customer/layout.tsx components/customer/notification-panel.tsx
git commit -m "feat: add customer notification center"
```

---

### Task 7: Expand Wallet Email templates, outbox delivery, and idempotency

**Files:**
- Modify: `lib/email/templates.ts`
- Modify: `lib/email/events.ts`
- Modify: `lib/email/outbox.ts`
- Modify: `lib/email/__tests__/templates.test.ts`
- Modify: `lib/email/__tests__/outbox.test.ts`
- Modify: `supabase/migrations/079_wallet_hold_resume_notifications.sql`

**Interfaces:**
- Add `withdrawal_resumed` and all agreed customer-impacting Wallet event types to `TransactionEmailType`.
- `enqueueWithdrawalEmail` accepts `category`, sanitized `reason`, and deterministic `eventKey` while preserving the existing `withdrawalId` key format.
- Templates use the existing App Email sender and Checkout brand style.
- Emails include only amount, status, human-readable category, approved detail, time, and a Wallet link; never full bank data, IC/Passport data, or full Stripe IDs.

- [ ] **Step 1: Add failing template/outbox tests**

Assert every event has a subject, HTML escaping, redacted references, Wallet link, unique event key, and no duplicate enqueue on retries. Assert failed sends remain in `email_outbox` and retry five times.

- [ ] **Step 2: Implement event and template expansion**

Do not roll back Wallet mutations on email failure. Enqueue first, attempt prompt processing, and leave failures for the outbox worker with exponential backoff.

- [ ] **Step 3: Run focused email tests**

Run: `npx vitest run lib/email/__tests__/templates.test.ts lib/email/__tests__/outbox.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add lib/email supabase/migrations/079_wallet_hold_resume_notifications.sql
git commit -m "feat: deliver idempotent wallet emails"
```

---

### Task 8: Update Admin withdrawal review UI for category, Resume, and clear errors

**Files:**
- Modify: `app/admin/withdrawals/page.tsx`
- Modify: `app/admin/withdrawals/__tests__/page.contract.test.ts`
- Modify: `lib/wallet/withdrawal-display.ts` if status/category label helpers belong there

**Interfaces:**
- Pending rows show Approve, Hold, Reject.
- Held rows show Resume and Reject; Hold is not available again.
- Hold/Reject/Resume dialogs require category and detail before submitting.
- The UI displays server error messages beneath the form and preserves the typed text/category.
- Buttons remain visually consistent: Approve primary, Hold gray outline, Reject red outline/light-red background, Resume secondary/primary according to design tokens.
- Status labels use title case (`Approved`, `Low`, `Held`, `Rejected`).

- [ ] **Step 1: Add failing component contract tests**

Assert held state renders Resume, pending state does not, category select is required, error text is visible, and button classes/styles are not overridden by global CSS.

- [ ] **Step 2: Implement the UI state machine**

Use action-specific category lists from Task 2. Submit to the matching route and refresh detail only after a successful response. Do not optimistically update status or balances.

- [ ] **Step 3: Run focused UI tests**

Run: `npx vitest run app/admin/withdrawals/__tests__/page.contract.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add app/admin/withdrawals/page.tsx app/admin/withdrawals/__tests__/page.contract.test.ts lib/wallet/withdrawal-display.ts
git commit -m "feat: add wallet resume review controls"
```

---

### Task 9: Add end-to-end coverage for Hold, Support, Resume, Notifications, and Email

**Files:**
- Create: `tests/e2e/wallet-hold-resume-notifications.spec.ts`
- Modify: `playwright.config.ts` only if the existing authenticated demo-account fixture needs a named Wallet Approver/Customer pair
- Create or modify: `tests/fixtures/wallet-governance.ts` if shared fixture setup is needed

**Interfaces:**
- Uses the existing seeded Wallet Approver and Customer accounts; does not create arbitrary production-like users in test code.
- Uses test-only deterministic withdrawal IDs and cleans up through the existing test reset/seed mechanism.

- [ ] **Step 1: Write the failing Playwright scenarios**

Cover:

1. Approver opens a pending request and sees required category/detail.
2. Irrelevant or disallowed reason shows a clear error and leaves status pending.
3. Valid Hold changes status to Held and leaves reserved balance unchanged.
4. Customer sees the Hold notification in the left-of-cart Bell panel and receives a queued Wallet email event.
5. Customer opens the linked Support Ticket and submits additional information.
6. Approver sees the linked ticket, resumes the request, and the approval cycle increments.
7. Old approval records do not satisfy the new cycle.
8. A fresh approval produces the expected status transition.
9. Reject releases the reserve exactly once and sends one notification/email.
10. Duplicate event/webhook processing does not duplicate notifications or emails.
11. Guest cannot access Notification APIs or the personal notification page.
12. Notification filters and latest-15 pagination work server-side.

- [ ] **Step 2: Run the new suite and verify expected failures**

Run: `npx playwright test tests/e2e/wallet-hold-resume-notifications.spec.ts`

Expected before implementation: failures identify missing Resume/UI/notification behavior.

- [ ] **Step 3: Run the suite after implementation**

Run: `npx playwright test tests/e2e/wallet-hold-resume-notifications.spec.ts --workers=1`

Expected: all scenarios PASS.

- [ ] **Step 4: Commit**

```powershell
git add tests/e2e/wallet-hold-resume-notifications.spec.ts tests/fixtures/wallet-governance.ts playwright.config.ts
git commit -m "test: cover wallet hold resume notifications"
```

---

### Task 10: Apply the migration and run the complete verification gate

**Files:**
- Modify only the remote Supabase database by running `supabase/migrations/079_wallet_hold_resume_notifications.sql` in SQL Editor or through the linked migration workflow.
- Do not run old migrations again.

- [ ] **Step 1: Apply migration 079**

Run the complete SQL file once against the same Supabase project used by the main repository. Then run:

```sql
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Verify database contracts**

Run queries confirming `approval_cycle`, `customer_reason_category`, `withdrawal_id`, `notifications.event_key`, `wallet_moderation_attempts`, the `resume_wallet_withdrawal` function, and the expanded email event constraint exist.

- [ ] **Step 3: Run static and unit verification**

```powershell
npm run lint
npx tsc --noEmit
npm test -- --run
```

Expected: ESLint has no new errors, TypeScript exits 0, and all Vitest tests pass (existing explicitly skipped tests remain documented).

- [ ] **Step 4: Run Playwright verification**

```powershell
npx playwright test tests/e2e/wallet-hold-resume-notifications.spec.ts --workers=1
npx playwright test --workers=1
```

Expected: the new Wallet suite passes and the existing suite has no regressions.

- [ ] **Step 5: Manual smoke test**

Use the seeded Wallet Approver and Customer accounts to perform Hold → Support reply → Resume → fresh Approve. Verify reserved/earnings balances, the Bell panel, filters, read state, sanitized email content, outbox retry state, and audit history. Confirm Guest Mode has no Notification icon.

- [ ] **Step 6: Commit only implementation files after verification**

```powershell
git status --short
git diff --check
```

Stage only files listed in Tasks 1–9. Do not stage unrelated existing worktree changes.

---

## Self-review checklist

- Hold remains reversible only through an approver-controlled Resume path.
- Resume creates a fresh approval cycle and cannot reuse stale approvals.
- Reject remains terminal and releases the reserve exactly once.
- Wallet moderation is stricter and more relevant than Bio moderation without changing Support's mask-and-allow behavior.
- Every customer-impacting Wallet event reaches both in-app notifications and the email outbox exactly once.
- Email failure never rolls back a financial state transition.
- Customer notification queries are user-scoped, paginated, filtered, and Guest-blocked.
- Playwright covers the complete user-visible workflow and duplicate-event safety.

Plan complete and saved to `docs/superpowers/plans/2026-07-20-wallet-hold-resume-moderation-notifications.md`.
