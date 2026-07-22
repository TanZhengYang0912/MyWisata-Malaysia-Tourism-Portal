# Withdrawal Review Admin UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the withdrawal review drawer safe and understandable for administrators by guiding decision selection, showing matching reasons, explaining consequences, warning about unavailable evidence, and requiring confirmation before a state-changing action.

**Architecture:** Keep the existing `app/admin/withdrawals/page.tsx` page and all withdrawal API payloads unchanged. Add human-readable copy maps and decision metadata in the page, derive the reason list from the selected decision, and keep the existing technical enum values only at the request boundary. Use the current contract-test style for page behavior and add focused assertions before changing production code.

**Tech Stack:** Next.js/React client page, TypeScript, Tailwind classes, Vitest, existing wallet reason schemas and withdrawal API routes.

## Global Constraints

- Keep existing action values and reason-category enum values for backend compatibility.
- Do not change withdrawal API routes, database migrations, wallet balances, reservations, permissions, or payout behavior.
- Use plain-language labels in the UI; technical enum values remain internal payload values.
- Require at least 10 trimmed characters for every submitted decision note/reason and keep the 500-character limit.
- Review-data warnings must not claim that a customer has no records when the source projection is unavailable.

---

### Task 1: Lock the admin-facing copy and action flow with failing tests

**Files:**
- Modify: `app/admin/withdrawals/__tests__/page.contract.test.ts:12-54`
- Test target: `app/admin/withdrawals/__tests__/page.contract.test.ts`

**Interfaces:**
- Consumes: the current page source and existing `WALLET_REASON_CATEGORIES` values.
- Produces: regression expectations for action-first selection, human-readable labels, warnings, note examples, and confirmation copy.

- [ ] **Step 1: Write the failing tests**

Add these tests to the existing `describe('withdrawal review action presentation', ...)` block:

```ts
it('shows decision-specific reason options only after a decision is selected', () => {
  expect(pageSource).toContain('Reason for this decision');
  expect(pageSource).toContain('selectedDecision');
  expect(pageSource).toContain('DECISION_REASON_COPY');
  expect(pageSource).toContain('selectedDecision ?');
  expect(pageSource).not.toContain('Object.keys(WALLET_REASON_RULES).map((key) => [key, ALL_WALLET_REASON_CATEGORIES])');
});

it('uses plain-language decision copy and consequences', () => {
  expect(pageSource).toContain('Payout details are ready');
  expect(pageSource).toContain('Additional risk review required');
  expect(pageSource).toContain('Keep the reserved funds held');
  expect(pageSource).toContain('Return the reserved amount to available balance');
});

it('warns administrators when review evidence is unavailable', () => {
  expect(pageSource).toContain('Review data is currently unavailable');
  expect(pageSource).toContain('Do not approve until the data is available');
  expect(pageSource).toContain('No reward transactions were found');
});

it('provides note examples and a confirmation summary before submission', () => {
  expect(pageSource).toContain('Example: KYC, wallet balance and payout destination were reviewed and verified.');
  expect(pageSource).toContain('Confirm withdrawal decision');
  expect(pageSource).toContain('detail.customer.displayName');
  expect(pageSource).toContain('detail.destinationLabel');
  expect(pageSource).toContain('Confirm decision');
  expect(pageSource).toContain('Cancel');
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```powershell
npm test -- app/admin/withdrawals/__tests__/page.contract.test.ts
```

Expected: FAIL because the current page still renders `Account action`, exposes the combined reason vocabulary, lacks the unavailable-evidence copy, and submits directly without confirmation.

- [ ] **Step 3: Commit the red tests**

```powershell
git add app/admin/withdrawals/__tests__/page.contract.test.ts
git commit -m "test: define friendlier withdrawal review flow"
```

### Task 2: Add decision-specific copy and state in the existing page

**Files:**
- Modify: `app/admin/withdrawals/page.tsx:32-143`
- Test: `app/admin/withdrawals/__tests__/page.contract.test.ts`

**Interfaces:**
- Consumes: `WALLET_REASON_RULES`, the existing `Action` type, and current withdrawal detail fields.
- Produces: `DECISION_COPY`, `DECISION_REASON_COPY`, `selectedDecision`, `pendingConfirmation`, and a human-readable UI-to-API mapping without changing request payloads.

- [ ] **Step 1: Add the minimal implementation**

Replace the combined reason list with action-specific metadata in `page.tsx`:

```tsx
const DECISION_REASON_COPY: Record<WalletReasonAction, Record<string, string>> = {
  hold: {
    insufficient_payout_information: 'Payout information is incomplete',
    kyc_or_identity_review: 'KYC or identity needs review',
    risk_review_required: 'Additional risk review required',
    payout_account_unavailable: 'Payout account is unavailable',
    other: 'Other reason',
  },
  reject: {
    bank_details_mismatch: 'Bank details do not match',
    kyc_or_identity_review: 'KYC or identity needs review',
    risk_review_required: 'Additional risk review required',
    payout_account_unavailable: 'Payout account is unavailable',
    other: 'Other reason',
  },
  resume: {
    additional_information_verified: 'Additional information verified',
    bank_details_confirmed: 'Bank details confirmed',
    kyc_review_completed: 'KYC review completed',
    risk_review_cleared: 'Risk review cleared',
    other: 'Other reason',
  },
  approve: {
    review_completed: 'Review completed',
    payout_ready: 'Payout details are ready',
    other: 'Other reason',
  },
  fraud_override: {
    risk_reviewed: 'Risk was reviewed',
    false_positive: 'False positive',
    exception_approved: 'Exception approved',
    other: 'Other reason',
  },
  adjustment: {},
  settings: {},
  approver_role: {},
};

const DECISION_COPY: Record<Action, { label: string; description: string; consequence: string; placeholder: string }> = {
  approve: {
    label: 'Approve',
    description: 'Confirm the review is complete and start payout processing.',
    consequence: 'The withdrawal can move to payout processing.',
    placeholder: 'Example: KYC, wallet balance and payout destination were reviewed and verified.',
  },
  hold: {
    label: 'Hold',
    description: 'Pause the review while requesting more information.',
    consequence: 'Keep the reserved funds held until the review continues.',
    placeholder: 'Example: Additional identity or payout information is required before processing.',
  },
  reject: {
    label: 'Reject',
    description: 'Reject the request because it cannot be approved.',
    consequence: 'Return the reserved amount to available balance.',
    placeholder: 'Example: Bank details could not be verified against the customer account.',
  },
  resume: {
    label: 'Resume review',
    description: 'Continue a request that was previously placed on hold.',
    consequence: 'The request becomes available for the next review step.',
    placeholder: 'Example: The requested information has been reviewed and the payout can continue.',
  },
  'fraud-override': {
    label: 'Override high risk',
    description: 'Record a Super Admin decision after reviewing the risk.',
    consequence: 'The high-risk override is recorded for audit.',
    placeholder: 'Example: Risk review completed and the alert was confirmed as a false positive.',
  },
};
```

Add `selectedDecision` and `pendingConfirmation` state. Use the selected action to derive the schema action and only render `WALLET_REASON_RULES[activeReasonAction]` after a decision is selected. Reset the category when the decision changes so a stale category cannot be submitted.

The existing `submitAction` must become a two-stage flow: validate note/category, then set `pendingConfirmation` instead of calling `fetch`. Move the current fetch body into `confirmAction`, preserving:

```tsx
const payload = nextAction === 'approve'
  ? { note: reason.trim(), reasonCategory }
  : { reason: reason.trim(), reasonCategory };
```

- [ ] **Step 2: Run the focused test to verify it passes**

Run:

```powershell
npm test -- app/admin/withdrawals/__tests__/page.contract.test.ts
```

Expected: PASS for the new copy/state assertions and all existing presentation assertions.

### Task 3: Make evidence and decision controls explicit in the drawer

**Files:**
- Modify: `app/admin/withdrawals/page.tsx:51-60,159-160`
- Test: `app/admin/withdrawals/__tests__/page.contract.test.ts`

**Interfaces:**
- Consumes: `detail.reviewSources`, `selectedDecision`, `DECISION_COPY`, `DECISION_REASON_COPY`, and `pendingConfirmation` from Task 2.
- Produces: accessible action controls, explicit evidence states, notes guidance, and a confirmation dialog.

- [ ] **Step 1: Add evidence-state rendering**

Update `ReviewLedgerSection` to use section-specific empty copy. In the drawer, calculate:

```tsx
const hasReviewEvidence = detail.reviewSources.rewardSources.length > 0
  || detail.reviewSources.affiliateSources.length > 0
  || detail.reviewSources.walletTransactions.length > 0
  || detail.reviewSources.fraudFlags.length > 0;
```

When `hasReviewEvidence` is false, render a warning block before the source sections with the exact copy:

```tsx
<p className="font-semibold">Review data is currently unavailable</p>
<p>Do not approve until the data is available.</p>
```

Use section-specific copy such as `No reward transactions were found.` rather than the generic `No records found.`. Change the empty timeline copy to `No decisions recorded yet.`.

- [ ] **Step 2: Replace the action form**

Render a decision selector or action cards first. Each available action must include its label, description, and consequence. After selection, render:

```tsx
<label>
  <span>Reason for this decision</span>
  <select value={reasonCategory} onChange={...}>
    <option value="">Select a reason</option>
    {WALLET_REASON_RULES[activeReasonAction].map((category) => (
      <option key={category} value={category}>
        {DECISION_REASON_COPY[activeReasonAction][category]}
      </option>
    ))}
  </select>
</label>
```

The textarea must use `DECISION_COPY[selectedDecision].placeholder`, show `Minimum 10 characters`, and not display a reason field before a decision is selected.

- [ ] **Step 3: Add confirmation summary and controls**

When `pendingConfirmation` is set, render a confirmation panel containing:

```tsx
<h3>Confirm withdrawal decision</h3>
<p>{detail.customer.displayName}</p>
<p>RM {(detail.amountSen / 100).toFixed(2)}</p>
<p>{detail.destinationLabel}</p>
<p>{DECISION_COPY[pendingConfirmation.action].label}</p>
<p>{DECISION_REASON_COPY[activeReasonAction][pendingConfirmation.reasonCategory]}</p>
<p>{pendingConfirmation.reason}</p>
```

Provide `Confirm decision` and `Cancel` buttons. `Confirm decision` calls `confirmAction`; `Cancel` clears `pendingConfirmation` without calling an API.

- [ ] **Step 4: Run the focused test**

Run:

```powershell
npm test -- app/admin/withdrawals/__tests__/page.contract.test.ts
```

Expected: PASS with no withdrawal API test changes required.

- [ ] **Step 5: Commit the page UX change**

```powershell
git add app/admin/withdrawals/page.tsx app/admin/withdrawals/__tests__/page.contract.test.ts
git commit -m "fix: guide admins through withdrawal decisions"
```

### Task 4: Run complete verification

**Files:**
- Read-only verification of: `app/admin/withdrawals/page.tsx`, `app/admin/withdrawals/__tests__/page.contract.test.ts`, `lib/validation/wallet-reason-schemas.ts`

**Interfaces:**
- Consumes: the completed page UX implementation and all existing project tests.
- Produces: fresh evidence that the focused regression, lint, TypeScript, and full test suite pass.

- [ ] **Step 1: Run the focused withdrawal page test**

```powershell
npm test -- app/admin/withdrawals/__tests__/page.contract.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 2: Run lint**

```powershell
npm run lint
```

Expected: exit code 0. Existing warnings may remain, but no new lint errors are allowed.

- [ ] **Step 3: Run TypeScript validation**

```powershell
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 4: Run the full test suite**

```powershell
npm test
```

Expected: exit code 0 with zero failed tests.

- [ ] **Step 5: Inspect the final diff**

```powershell
git diff HEAD~1 -- app/admin/withdrawals/page.tsx app/admin/withdrawals/__tests__/page.contract.test.ts
git status --short
```

Expected: only the planned admin review UX files are changed, with no API, migration, wallet, or permission changes.
