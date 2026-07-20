# Withdrawal Approval, High-Risk Override and Management UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use \`executing-plans\` to implement this plan task-by-task. Use \`test-driven-development\` before each code change and \`verification-before-completion\` before claiming completion. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Complete the remaining governed Wallet Withdrawal module: distinct two-person approval, Super Admin-only high-risk override, operational maintenance, complete approver/settings/report management UI, customer receipts and reliable in-app/email lifecycle notifications.

**Architecture:** Keep PostgreSQL as the only authority for withdrawal state, approvals, risk decisions, balances, audit rows and in-app notifications. Every state transition is a \`SECURITY DEFINER\` RPC called by a server-only Next.js route; browser components never write money, roles, audit logs, notifications or withdrawal state directly. Stripe calls happen only after the database has atomically confirmed that the request is ready for payout, and every Stripe/DB boundary is idempotent.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase PostgreSQL/RLS/\`SECURITY DEFINER\` functions, Stripe Connect Standard, existing email outbox/Resend-or-Gmail provider, existing Gemini moderation wrapper, Vitest, Playwright.

## Global Constraints

- Work in \`C:\Users\tanzh\Documents\GitHub\FYP-industrial-project\` (the main repository) unless the owner explicitly requests an isolated worktree. Do not modify unrelated modules.
- \`supabase/migrations/073_wallet_withdrawal_governance.sql\` has already been run on the main Supabase project. Never edit, rename, or re-run it. All new database work goes in \`supabase/migrations/074_withdrawal_approval_governance.sql\`.
- Currency is MYR and database calculations use integer sen. JavaScript numbers are presentation/input only.
- Preserve the existing \`pending\`, \`pending_second_approval\`, \`approved\`, \`processing\`, \`hold\`, \`overdue\`, \`rejected\`, \`paid\`, \`completed\`, and \`failed\` status vocabulary.
- One active withdrawal per user remains enforced by the existing partial unique index. Do not remove it or silently delete old requests.
- A Wallet Approver is the existing database \`approver\` role, labelled “Wallet Approver” in UI. Super Admin is a separate \`super_admin\` role and is the only role allowed to manage approvers, settings, adjustments, fraud overrides, maintenance and reports.
- Approver actions require a different active approver from the customer. No actor may approve, hold, reject or override their own withdrawal.
- A request below the configured dual-approval threshold needs one valid approver. A request at or above the threshold needs two distinct approvals. The second approval is the only event that makes a dual request payout-ready.
- A \`high\` risk assessment blocks approval until a Super Admin records a moderated override. Override is not an approval and never bypasses the two-person requirement.
- Hold and reject reasons are trimmed, 10–500 characters, passed through the existing Gemini moderation wrapper, and stored in audit/approval rows. Approve notes are optional; non-empty notes are also 10–500 characters and moderated.
- Customer-facing messages may include a human-readable reason, amount, request ID, timestamps and a masked Stripe destination. Never expose KYC images, IC/passport number, full bank details, secrets, raw risk rules or Gemini prompts.
- Use \`lib/audit.ts\` (\`auditAndNotify\`/\`recordAudit\`) and existing email outbox helpers. Never import or call \`backend/core/audit.ts\` from a browser component.
- Existing top-up-first Wallet checkout, full refund, adjustment, withdrawal submission, reject and hold behavior must remain unchanged except for the explicit governance additions in this plan.
- Do not claim a migration is deployed until the owner runs it in the main Supabase SQL Editor and the verification SQL in Task 2 returns the expected rows.

## Existing Baseline (read before coding)

Read these files first and preserve their established patterns:

- \`supabase/migrations/073_wallet_withdrawal_governance.sql\` — already deployed schema, settings, balance projections and submission/reject/hold RPCs.
- \`app/api/admin/withdrawals/[id]/approve/route.ts\` — legacy approval + Stripe sequence that must be replaced without losing its transfer/payout idempotency safeguards.
- \`app/api/admin/withdrawals/[id]/reject/route.ts\` and \`app/api/admin/withdrawals/[id]/hold/route.ts\` — existing moderated routes and error envelope.
- \`app/api/wallet/withdrawals/route.ts\` — customer submission contract.
- \`lib/email/events.ts\`, \`lib/email/outbox.ts\`, \`lib/email/templates.ts\` — existing email event names and idempotency behavior.
- \`lib/audit.ts\` — server-side audit + in-app notification RPC wrapper.
- \`app/admin/withdrawals/page.tsx\`, \`app/admin/layout.tsx\`, \`app/customer/wallet/page.tsx\` — existing UI and role guard.
- \`app/api/admin/users\`, \`app/admin/users\`, and existing role functions in migrations — established Super Admin user-management patterns.

Before writing SQL, run:

~~~powershell
Set-Location C:\Users\tanzh\Documents\GitHub\FYP-industrial-project
rg -n "withdrawal_requests|withdrawal_approvals|withdrawal_risk_assessments|record_admin_approval|admin_set_processing|stripe_transfer|stripe_payout|platform_settings|is_approver|is_super_admin" supabase/migrations/073_wallet_withdrawal_governance.sql supabase/migrations app/api lib app/admin
~~~

## File Map

### Database

- Create: \`supabase/migrations/074_withdrawal_approval_governance.sql\` — additive approval/risk/maintenance/report functions, indexes, grants and RLS. Do not edit 073.
- Create: \`supabase/tests/withdrawal_approval_governance.sql\` — pgTAP or SQL assertions for role, state, threshold, override and idempotency contracts.

### Server contracts and helpers

- Create: \`lib/wallet/withdrawal-review.ts\` — shared API-safe types for detail/list/risk/approval timeline.
- Create: \`lib/wallet/withdrawal-risk.ts\` — pure risk-level mapping used by tests; database snapshot remains authoritative.
- Create: \`lib/wallet/withdrawal-notifications.ts\` — one idempotent fan-out for approvers, Super Admin and customer.
- Modify: \`lib/validation/schemas.ts\` — strict schemas for approve note, hold/reject reason, override reason, settings and approver actions.
- Modify: \`lib/email/events.ts\` and \`lib/email/templates.ts\` — lifecycle event payloads and withdrawal receipt fields.

### API routes

- Modify: \`app/api/admin/withdrawals/[id]/approve/route.ts\` — optional moderated note, first/second approval RPC, high-risk gate, Stripe only when ready.
- Modify: \`app/api/admin/withdrawals/[id]/reject/route.ts\` — use the 074 transition contract and return stable error codes.
- Modify: \`app/api/admin/withdrawals/[id]/hold/route.ts\` — use the 074 transition contract and return stable error codes.
- Create: \`app/api/admin/withdrawals/[id]/fraud-override/route.ts\` — Super Admin-only override.
- Create: \`app/api/admin/withdrawals/[id]/route.ts\` — paginated detail, non-sensitive review context and approval history.
- Create: \`app/api/admin/withdrawals/route.ts\` — server-side pagination, status/risk/search filters.
- Create: \`app/api/admin/wallet-settings/route.ts\` — Super Admin read/update of existing \`platform_settings\` keys.
- Create: \`app/api/admin/wallet-approvers/route.ts\` — Super Admin list/grant/revoke of the existing \`approver\` role.
- Create: \`app/api/internal/wallet-maintenance/route.ts\` — cron-secret-protected clearing/escalation/report job.
- Create or modify: Stripe webhook/callback route already used by this repo — make payout paid/failed transitions call guarded RPCs and enqueue receipt email exactly once.

### UI

- Create: \`components/admin/withdrawal-review-drawer.tsx\` — detail panel, risk facts, wallet snapshot and timeline.
- Create: \`components/admin/withdrawal-decision-form.tsx\` — approve/hold/reject/override forms and inline server errors.
- Modify: \`app/admin/withdrawals/page.tsx\` — paginated queue, filters, role-aware actions and drawer.
- Create: \`app/admin/wallet/settings/page.tsx\` — settings and approver management; route visible only to Super Admin.
- Create: \`app/admin/reports/payouts/page.tsx\` — monthly MYT payout report table/export.
- Modify: \`app/admin/layout.tsx\` — Wallet Settings and Payout Reports links for Super Admin only; keep current navigation order.
- Modify: \`app/customer/wallet/page.tsx\` — reserved/withdrawn balances, status/reason and receipt links.
- Create: \`app/customer/wallet/withdrawals/[id]/page.tsx\` — customer withdrawal receipt/detail view.
- Modify: existing customer notification menu — preserve the Bell immediately to the left of Cart.

### Tests

- Create: \`lib/wallet/__tests__/withdrawal-risk.test.ts\`.
- Create: \`app/api/admin/withdrawals/[id]/approve/__tests__/route.test.ts\`.
- Create: \`app/api/admin/withdrawals/[id]/fraud-override/__tests__/route.test.ts\`.
- Create: \`app/api/admin/withdrawals/__tests__/route.test.ts\`.
- Create: \`app/api/admin/wallet-settings/__tests__/route.test.ts\`.
- Create: \`app/api/admin/wallet-approvers/__tests__/route.test.ts\`.
- Create/update: Playwright specs under \`tests/withdrawal-governance.spec.ts\`.

---

## Task 1: Freeze the deployed baseline and write the contracts

**Files:**

- Test: \`lib/wallet/__tests__/withdrawal-risk.test.ts\`
- Test: \`app/api/admin/withdrawals/[id]/approve/__tests__/route.test.ts\`
- Test: \`app/api/admin/withdrawals/[id]/fraud-override/__tests__/route.test.ts\`

**Interfaces produced:**

~~~ts
export type WithdrawalRiskLevel = 'low' | 'review' | 'high';
export type WithdrawalApprovalState = 'pending' | 'pending_second_approval' | 'approved';
export type WithdrawalReviewDecision = 'approve' | 'hold' | 'reject' | 'fraud_override';

export type WithdrawalReviewDetail = {
  id: string; userId: string; amountSen: number; status: string;
  requiresDualApproval: boolean; approvalCount: number;
  riskLevel: WithdrawalRiskLevel; riskOverridden: boolean;
  customer: { displayName: string; email: string; kycStatus: string; kycApprovedAt: string | null };
  wallet: { topupSen: number; earningsSen: number; pendingEarningsSen: number; reservedSen: number; withdrawnSen: number };
  destinationLabel: string; createdAt: string; customerReason: string | null;
  approvals: Array<{ actorId: string; actorLabel: string; action: string; note: string | null; createdAt: string }>;
  riskSnapshot: Record<string, unknown>;
};
~~~

- [ ] Step 1: Write risk tests: KYC not approved, payout disabled, amount at threshold, recent failures and active-request count map to deterministic \`low\`, \`review\`, \`high\` facts.
- [ ] Step 2: Write route tests with mocked Supabase/Stripe: unauthenticated→401; ordinary customer→403; first dual approval→\`pending_second_approval\`; second distinct approver→Stripe path; same approver twice→409; high-risk without override→\`HIGH_RISK_OVERRIDE_REQUIRED\`; Super Admin override→200; note/reason under 10→422.
- [ ] Step 3: Run the focused tests and confirm they fail for missing contracts/routes.

~~~powershell
npm test -- lib/wallet/__tests__/withdrawal-risk.test.ts "app/api/admin/withdrawals/[id]/approve/__tests__/route.test.ts" "app/api/admin/withdrawals/[id]/fraud-override/__tests__/route.test.ts"
~~~

- [ ] Step 4: Do not implement yet; record the exact existing RPC signatures and columns returned by the main Supabase project. If they differ from this plan, stop and update the plan before writing 074.
- [ ] Step 5: Commit only the tests/contracts: \`git add lib/wallet/__tests__ app/api/admin/withdrawals/[id] && git commit -m "test: define withdrawal governance contracts"\`.

## Task 2: Add migration 074 for two-person approval and high-risk override

**Files:**

- Create: \`supabase/migrations/074_withdrawal_approval_governance.sql\`
- Create: \`supabase/tests/withdrawal_approval_governance.sql\`

**Consumes:** deployed tables/functions from 073 and existing role helpers \`is_approver\`, \`is_super_admin\`.

**Produces:** guarded RPCs used by all later routes. Every function must derive the actor from \`auth.uid()\`.

- [ ] Step 1: Add only additive indexes/columns that are absent. First query the catalog in SQL Editor; never assume a column is absent:

~~~sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('withdrawal_requests','withdrawal_approvals','withdrawal_risk_assessments')
order by table_name, ordinal_position;
~~~

- [ ] Step 2: Add a unique partial index preventing the same approver from recording the same decision twice, and an index for queue filtering:

~~~sql
create unique index if not exists withdrawal_approvals_one_decision_per_actor
on public.withdrawal_approvals (request_id, approver_id, action)
where action in ('approve','reject','hold');

create index if not exists withdrawal_requests_review_queue_idx
on public.withdrawal_requests (status, created_at desc);
~~~

- [ ] Step 3: Create or replace \`public.assess_withdrawal_risk(p_withdrawal_id uuid) returns jsonb\`. It must lock the request, read only factual fields (KYC status, payout enabled, amount/threshold, recent failed/rejected withdrawals, active request count and account age), upsert one \`withdrawal_risk_assessments\` row, and return \`{risk_level,snapshot,assessed_at}\`. It must not read or return KYC file paths.
- [ ] Step 4: Create or replace \`public.override_withdrawal_risk(p_withdrawal_id uuid, p_reason text, p_ip inet default null) returns jsonb\`. Enforce \`is_super_admin(auth.uid())\`, self-dealing rejection, reason length ≥10, current request status in reviewable states, and \`risk_level='high'\`. Set \`overridden_by\`, \`override_reason\`, \`overridden_at\`; insert audit row with IP; create one customer-safe in-app notification; return the request and override timestamp. The route performs Gemini moderation before calling it; the RPC remains a second length/role boundary.
- [ ] Step 5: Create or replace \`public.approve_wallet_withdrawal(p_withdrawal_id uuid, p_note text default null, p_ip inet default null) returns jsonb\` with this exact decision order:
  1. Require authenticated active Wallet Approver or Super Admin.
  2. Lock request and wallet; reject self-dealing.
  3. Recalculate/read risk. If high and not overridden, raise \`high_risk_override_required\`.
  4. Reject already-approved-by-this-actor with a stable error.
  5. Insert one \`approve\` row with optional note.
  6. Count distinct approve actors. For non-dual requests, set \`approved\` and return \`ready=true\`. For dual requests with one actor, set \`pending_second_approval\` and return \`ready=false\`. For dual requests with two distinct actors, set \`approved\` and return \`ready=true\`.
  7. Insert audit and notify the customer and remaining active approvers. Do not call Stripe from SQL.

Return shape:

~~~json
{"request_id":"uuid","status":"pending_second_approval|approved","ready":false,"approval_count":1,"required_approvals":2,"risk_level":"low|review|high"}
~~~

- [ ] Step 6: Create or replace \`public.mark_withdrawal_processing(p_withdrawal_id uuid, p_transfer_id text, p_payout_id text) returns jsonb\`. Require the request to be \`approved\`, verify the approval count/risk override again, reject mismatched IDs, and update to \`processing\` idempotently. A second identical call returns the existing result; different Stripe IDs return a conflict.
- [ ] Step 7: Create or replace \`public.complete_withdrawal_payout(p_withdrawal_id uuid, p_payout_id text, p_status text) returns jsonb\`. Accept only Stripe \`paid/completed\` or \`failed\`; lock request; no-op on the same terminal result; on success move \`reserved_earnings_sen\` to \`withdrawn_earnings_sen\` and append one \`withdrawal_complete\` ledger row; on failure restore earnings and release reserve with one \`withdrawal_cancel\` row. Add audit + customer notification in the same transaction.
- [ ] Step 8: Create or replace \`public.escalate_withdrawals(p_now timestamptz default now()) returns integer\`. Read \`withdrawal.escalation_hours\` and \`withdrawal.hold_escalation_hours\`; transition only eligible pending/hold requests to \`overdue\`, preserve \`overdue_from_status\`, append audit and notify approvers/customer once. Re-running at the same time must return zero additional transitions.
- [ ] Step 9: Create or replace \`public.generate_monthly_payout_report(p_period_start date, p_generated_by text) returns jsonb\`. Aggregate only immutable withdrawal/ledger/audit data in \`Asia/Kuala_Lumpur\`, upsert by period, and return totals/counts by status/risk. Super Admin or the internal maintenance route may call it; browser users cannot.
- [ ] Step 10: Add explicit \`REVOKE ALL\` and \`GRANT EXECUTE ... TO authenticated\` for customer/approver RPCs, and grant the maintenance/report functions only to the service role used by the internal route. Keep tables without client INSERT/UPDATE policies.
- [ ] Step 11: Write SQL assertions for: one approver cannot satisfy two approvals; two distinct approvers can; high-risk block; only Super Admin override; override is not approval; Stripe IDs idempotent; payout failure restores reserve; escalation idempotent; report period unique.
- [ ] Step 12: Have the owner run 074 once in the main SQL Editor. Then run \`NOTIFY pgrst, 'reload schema';\` in that same SQL Editor session. Do not run 073 again.
- [ ] Step 13: Commit: \`git add supabase/migrations/074_withdrawal_approval_governance.sql supabase/tests/withdrawal_approval_governance.sql && git commit -m "feat: add governed withdrawal approval state machine"\`.

## Task 3: Build the server-only review and decision routes

**Files:**

- Modify: \`app/api/admin/withdrawals/[id]/approve/route.ts\`
- Modify: \`app/api/admin/withdrawals/[id]/reject/route.ts\`
- Modify: \`app/api/admin/withdrawals/[id]/hold/route.ts\`
- Create: \`app/api/admin/withdrawals/[id]/fraud-override/route.ts\`
- Create: \`app/api/admin/withdrawals/[id]/route.ts\`
- Create: \`app/api/admin/withdrawals/route.ts\`
- Modify: \`lib/validation/schemas.ts\`, \`lib/wallet/withdrawal-review.ts\`, \`lib/wallet/withdrawal-notifications.ts\`

- [ ] Step 1: Write route tests for every HTTP status and stable error code before changing routes.
- [ ] Step 2: Replace browser/legacy \`record_admin_approval\` usage with \`approve_wallet_withdrawal\`. The route parses \`{note?: string}\`, moderates a non-empty note with context \`withdrawal_approve_note\`, passes a server-derived IP, and maps \`high_risk_override_required\` to 409 with \`{code:"HIGH_RISK_OVERRIDE_REQUIRED"}\`.
- [ ] Step 3: Keep Stripe transfer/payout idempotency: retrieve an existing transfer/payout before creating; use stable keys \`wr-{withdrawalId}-transfer\` and \`wr-{withdrawalId}-payout\`; persist transfer before payout; call \`mark_withdrawal_processing\` only after both IDs are known. If Stripe fails, return retryable 502 and leave the request \`approved\` with reserve intact.
- [ ] Step 4: Update reject/hold routes to use the 074 transition functions and stable envelopes. They must return moderation-unavailable errors distinctly from content-rejected errors and must never write audit rows from the browser.
- [ ] Step 5: Implement override route: authenticate, require the server-side Super Admin check through the RPC, parse/moderate \`{reason}\`, pass IP, and return \`{risk_level:"review",overridden_at}\`. Wallet Approver requests return 403.
- [ ] Step 6: Implement list route with query parameters \`page\` (1-based), \`pageSize\` (\`15|25|50|100\`), \`status\`, \`risk\`, \`search\`, \`sort\` (only \`created_at_desc\`). Query only the requested page, return \`{items,total,page,pageSize,totalPages}\` and never load all users/withdrawals into a client component.
- [ ] Step 7: Implement detail route. Join safe user/profile fields and wallet totals; return masked destination, KYC status/date/type, risk snapshot, approval timeline, ledger summary and customer-visible reason. Explicitly omit document paths, IC/passport numbers, Stripe secrets and raw account/bank details.
- [ ] Step 8: Add idempotent notification/email fan-out. The customer gets submitted/second-approval/approved/hold/rejected/paid/failed events; active approvers get review/second-approval/escalation events; Super Admin gets high-risk/escalation events. Use deterministic event keys so retries do not duplicate outbox rows.
- [ ] Step 9: Run focused Vitest tests, TypeScript and lint on only changed routes.

~~~powershell
npm test -- "app/api/admin/withdrawals/**/__tests__/*.test.ts"
npx tsc --noEmit
npx eslint app/api/admin/withdrawals lib/validation/schemas.ts lib/wallet
~~~

- [ ] Step 10: Commit: \`git add app/api/admin/withdrawals lib/validation/schemas.ts lib/wallet && git commit -m "feat: expose governed withdrawal review APIs"\`.

## Task 4: Implement the complete Admin Withdrawal Review UI

**Files:**

- Create: \`components/admin/withdrawal-review-drawer.tsx\`
- Create: \`components/admin/withdrawal-decision-form.tsx\`
- Modify: \`app/admin/withdrawals/page.tsx\`

- [ ] Step 1: Write component tests for status/risk/role matrix: Approver can approve/hold/reject; only Super Admin sees override; high risk disables approve until override; second approval shows “1 of 2”; own request hides all decisions.
- [ ] Step 2: Replace the current all-rows client fetch with server pagination and URL state (\`page\`, \`pageSize\`, \`status\`, \`risk\`, \`search\`). Default to 15 and allow 15/25/50/100. Show page number input and next/previous controls.
- [ ] Step 3: Add filters for \`pending\`, \`pending_second_approval\`, \`hold\`, \`overdue\`, \`approved\`, \`processing\`, \`paid\`, \`completed\`, \`rejected\`, \`failed\`; add \`risk\` filter and customer/email search. Keep default sort registration time descending.
- [ ] Step 4: Add a drawer/detail view with customer name/email, KYC status (not documents), amount, four wallet balances, masked Stripe destination, risk level and factual snapshot, threshold, approval timeline and audit-safe status timeline.
- [ ] Step 5: Add decision forms. Approve note is optional; Hold/Reject/Override reasons are required and show live remaining characters. Display server error code/message inline, not a generic alert. Disable repeated submissions while pending.
- [ ] Step 6: For high risk, show a clear Super Admin-only “Override risk” action. After override, refresh detail and leave dual approval requirement visible. Never make an Approver’s button silently bypass the override.
- [ ] Step 7: Remove \`recordApproval\` from the client page. All mutation buttons call the server routes only.
- [ ] Step 8: Run component tests and \`npx tsc --noEmit\`; commit \`feat: add withdrawal review workspace\`.

## Task 5: Add Super Admin Wallet Settings and Wallet Approver management

**Files:**

- Create: \`app/api/admin/wallet-settings/route.ts\`
- Create: \`app/api/admin/wallet-approvers/route.ts\`
- Create: \`app/admin/wallet/settings/page.tsx\`
- Modify: \`app/admin/layout.tsx\`
- Modify: existing user-management API/component only where the Wallet Approver panel is added

- [ ] Step 1: Write route tests: non-Super Admin→403; invalid ranges→422; valid update persists through the existing \`platform_settings\`; every change has ≥10-character moderated reason, audit row and notification.
- [ ] Step 2: Implement settings GET for \`wallet.clearance_days\`, \`withdrawal.min_amount_sen\`, \`withdrawal.dual_approval_threshold_sen\`, \`withdrawal.escalation_hours\`, \`withdrawal.hold_escalation_hours\` from \`platform_settings\` only. Do not create a duplicate settings table.
- [ ] Step 3: Implement settings PATCH with strict schema/ranges: clearance 1–30; minimum at least 100 sen; dual threshold at least 0; escalation 24–168 hours; hold escalation 24–720 hours. Moderate the required reason before RPC/update.
- [ ] Step 4: Implement approver GET/PATCH. Grant/revoke only the existing \`approver\` role; prevent self-role changes; prevent removing the last active Wallet Approver; do not alter \`super_admin\`; audit every change.
- [ ] Step 5: Build UI cards showing current values, effective scope (“new requests/rewards only”), last updated time and save success/error. Add Wallet Approvers table with active/inactive state and grant/revoke reason dialog.
- [ ] Step 6: Add \`/admin/wallet/settings\` and \`/admin/reports/payouts\` links only for Super Admin. Existing Approver can still use \`/admin/withdrawals\` and cannot see settings/role management.
- [ ] Step 7: Run route/UI tests and commit \`feat: add wallet governance settings and approver management\`.

## Task 6: Add maintenance escalation and monthly payout reporting

**Files:**

- Create: \`app/api/internal/wallet-maintenance/route.ts\`
- Create: \`app/admin/reports/payouts/page.tsx\`
- Modify: \`vercel.json\` only if the repository already uses Vercel cron configuration

- [ ] Step 1: Write tests for invalid/missing cron secret, idempotent escalation, monthly MYT period calculation and report upsert.
- [ ] Step 2: Protect the route with \`CRON_SECRET\` or the repository’s existing maintenance secret. Call \`escalate_withdrawals\`, reward-clearance RPC, and report generation in that order. Return counts, never secrets.
- [ ] Step 3: Add a Super Admin report page with month selector, status/risk totals, approved/paid/failed amounts, reserved/withdrawn totals and CSV export generated from the server response.
- [ ] Step 4: If an existing cron file is present, add one hourly schedule; otherwise do not invent a second scheduler. Document the exact Vercel cron setting in the plan handoff.
- [ ] Step 5: Run tests and commit \`feat: add withdrawal escalation and payout reports\`.

## Task 7: Customer withdrawal receipt and notification/email completion

**Files:**

- Modify: \`app/customer/wallet/page.tsx\`
- Create: \`app/customer/wallet/withdrawals/[id]/page.tsx\`
- Modify: \`lib/email/events.ts\`, \`lib/email/templates.ts\`, existing notification menu/API only as needed

- [ ] Step 1: Write tests for receipt visibility: customer can see own request; another customer gets 404/403; receipt masks destination; KYC/IC/bank secrets never appear.
- [ ] Step 2: Show Top-up, Available Earnings, Pending Earnings, Reserved and Withdrawn balances. Treat only Top-up + Available Earnings as spendable.
- [ ] Step 3: Show withdrawal status timeline and customer-visible hold/reject reason. Add links to the receipt detail route from the ledger/history.
- [ ] Step 4: Ensure the customer receives in-app and email messages for submit, waiting for second approval, approved/processing, hold, rejected/refunded, paid/completed and failed/refunded. Paid email is the receipt and includes request ID, MYR amount, date, masked destination and Stripe payout reference.
- [ ] Step 5: Verify the notification Bell stays immediately left of Cart and each unread badge remains independent.
- [ ] Step 6: Run route/component tests and commit \`feat: complete withdrawal receipts and lifecycle notifications\`.

## Task 8: End-to-end verification in the main Supabase project

**Files:**

- Test: \`tests/withdrawal-governance.spec.ts\`
- No production code changes unless a failing test identifies a scoped defect.

Create or use four test users in the main project: Customer (KYC-approved + Stripe payout enabled), Wallet Approver A, Wallet Approver B, and Super Admin. Do not use real identity documents or real bank details.

- [ ] Step 1: Submit RM100 (below threshold). Approver A approves; confirm status becomes \`approved\` then \`processing\`, exactly one approval row and one Stripe transfer/payout idempotency key.
- [ ] Step 2: Submit RM500 (at/above the configured threshold). Approver A approves; confirm \`pending_second_approval\`, reserve unchanged, customer and remaining approver notification sent. Approver A tries again and receives a clear duplicate-approval error. Approver B approves; confirm payout begins exactly once.
- [ ] Step 3: Make the risk snapshot high. Approver B attempts approval and receives \`HIGH_RISK_OVERRIDE_REQUIRED\`; no Stripe call occurs. Super Admin enters a clean ≥10-character reason; moderation passes; risk shows overridden. Two distinct approvals are still required.
- [ ] Step 4: Submit a hold/reject reason under 10 characters and a moderated/disallowed reason. Confirm inline validation or content-rejected error explains the failure and no state/balance changes occur. Submit a clean reason; confirm hold retains reserve and reject releases it exactly once.
- [ ] Step 5: Use Stripe test mode to simulate payout success and failure. Success moves reserved→withdrawn and sends receipt. Failure moves reserved→earnings and sends failure/refund email. Repeat webhook delivery and confirm no duplicate ledger/email rows.
- [ ] Step 6: Trigger maintenance. Confirm pending/hold escalation uses configured windows, sets \`overdue_from_status\`, notifies once and is idempotent on rerun. Generate a monthly report and compare totals to the ledger.
- [ ] Step 7: Verify security manually: direct browser Supabase insert/update attempts fail; customer cannot call admin RPCs; Wallet Approver cannot access settings/override; Super Admin cannot approve their own withdrawal; all audit rows contain actor/action/entity/IP where applicable.
- [ ] Step 8: Run the full local verification suite:

~~~powershell
npm test
npx tsc --noEmit
npm run lint
git diff --check
~~~

Expected: all tests pass, TypeScript exits 0, lint exits 0, and \`git diff --check\` prints no whitespace errors.

## Commit and handoff rules for Claude

Use one focused commit per completed task. Suggested sequence:

~~~text
test: define withdrawal governance contracts
feat: add governed withdrawal approval state machine
feat: expose governed withdrawal review APIs
feat: add withdrawal review workspace
feat: add wallet governance settings and approver management
feat: add withdrawal escalation and payout reports
feat: complete withdrawal receipts and lifecycle notifications
test: verify withdrawal governance end to end
~~~

Before each commit:

1. \`git status --short\` and preserve unrelated user changes.
2. \`git diff -- <changed files>\` and inspect every mutation.
3. Run the task’s focused tests, then TypeScript/lint as specified.
4. Do not stage \`.env.local\`, API keys, Stripe secrets, Supabase service keys, test identity documents or real phone/bank data.

Stop and ask the owner instead of guessing if any of these occur:

- 074 conflicts with an already-created object or the owner’s SQL Editor reports a duplicate/column/type conflict.
- The main project schema differs from the signatures in this plan.
- Stripe returns an unsupported capability/account error or payout status cannot be mapped safely.
- A requested change would touch catalogue, vendor/outlet, KYC storage/review, chat, profile or affiliate authorization code outside the listed files.
- A test requires a real user’s KYC image, bank account or production payment.

## Definition of Done

- Two distinct active Wallet Approvers (or one approver for below-threshold requests) are enforced by PostgreSQL, not just UI.
- High-risk withdrawals cannot be approved until a Super Admin records a moderated override; override never counts as an approval.
- Stripe transfer/payout creation is reachable only after the guarded RPC returns \`ready=true\`, and retries are idempotent.
- Payout success/failure updates reserved/withdrawn/earnings balances and ledger exactly once.
- Admin has paginated, searchable, filterable review UI with non-sensitive KYC/risk context, inline errors and role-aware decision forms.
- Super Admin can manage thresholds, escalation windows, reports and Wallet Approver assignments with audit/reason enforcement.
- Customer sees balances, timeline, reasons and receipt; customer and approver notifications are delivered in-app and by email without secret data.
- Migration 074 is applied and schema cache reloaded in the main Supabase project; SQL, Vitest, TypeScript, lint, diff-check and Playwright verification have evidence.

## Required Skills for Claude

1. \`using-superpowers\` — follow the repository’s skill policy before any response/action.
2. \`executing-plans\` — execute this document task-by-task with checkpoints.
3. \`test-driven-development\` — write failing focused tests before each implementation change.
4. \`systematic-debugging\` — use for any failing test, migration error, Stripe error or unexpected state; reproduce before editing.
5. \`verification-before-completion\` — run and report commands/evidence before claiming a task or the feature is complete.
6. \`requesting-code-review\` — after Task 8, request a standards/spec review before proposing merge.
7. \`receiving-code-review\` — use if review feedback is returned; verify each comment against schema/tests before changing code.
8. \`finishing-a-development-branch\` — only after the owner chooses merge/PR/keep/discard; do not merge automatically.

\`writing-plans\` was used to create this plan. Do not use \`brainstorming\` to reopen already-confirmed product decisions; use it only if Claude discovers a genuinely new product choice that changes the state machine or money contract.

