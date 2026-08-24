# Streamline KYC Review Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Implemented; amended after user review to retain four summary metrics
**Goal:** Turn the KYC review list into a compact prioritisation queue and move document inspection plus review decisions into one focused detail drawer.

**Architecture:** `app/admin/kyc/page.tsx` remains responsible for loading, filtering, and submitting review mutations. Two focused presentation components render a compact queue row and a modal detail drawer; the drawer owns local reason/confirmation state and calls the existing signed-document and review handlers. Existing KYC APIs, permission checks, append-only review RPCs, and database types remain unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, TailwindCSS, react-i18next, Vitest with `react-dom/server`.

## Context

The current queue row simultaneously renders customer identity, two document links, OCR evidence, three decision buttons, and an inline reason form. This combines prioritisation, evidence inspection, and decision-making in one layer and creates the visual density shown in the supplied screenshot.

The approved design follows the first-party GitHub research in `docs/research/2026-08-24-mature-review-queue-action-density.md`: the queue identifies the next case; a detail layer presents evidence and valid decisions.

The repository instructions refer to `docs/requirements.md`, `docs/architecture.md`, `docs/testing.md`, and `docs/coding-standards.md`, but those files are not present in this checkout. This plan therefore uses the existing KYC security design, KYC append-only ADR, current admin shell patterns, and existing tests as the authoritative local context.

**User amendment (2026-08-24):** Keep the compact queue and review drawer, but restore the four-card metric row: Pending review, Information requested, Verified users, and Oldest queue item. The separate Verified users list remains out of scope.

## Decisions

### Selected approach: focused review drawer

- Each queue row shows customer name, document type, review status, submitted date/queue position, and one `Review` button.
- Opening `Review` displays a modal side/detail layer containing both document links, OCR evidence, and the decision controls.
- `pending` submissions expose Approve, Request information, and Reject.
- `info_requested` submissions are read-only and explain that the case is waiting for customer action; they must not expose another decision before resubmission.
- Approve uses the existing confirmation dialog. Request information and Reject require an allowed structured reason; `other` requires at least ten trimmed characters, followed by confirmation.
- The list keeps search and status filtering but removes selection checkboxes and every bulk decision action.
- The metric area shows actionable pending count, information-requested count, verified-user count, and the oldest actionable submission. Information-requested count also remains visible in the status filter. The separate verified-users section leaves this work queue.
- Closing the drawer discards unsent local reason input. A successful decision closes the drawer and removes the processed case from the queue.

### Alternatives considered

1. **Dedicated `/admin/kyc/[id]` route:** strongest deep-linking and browser history, but requires a new detail-fetch route or duplicate queue fetching. It is larger than the requested density fix.
2. **Expandable queue row:** smallest code change, but evidence and decisions still expand inside the queue and recreate the same scanning problem.
3. **Review drawer (selected):** preserves queue context, reuses the existing admin modal language, and cleanly separates scanning from review with no API or database change.

## Global Constraints

- Do not change KYC approval authority, API authorisation, signed URL generation, structured reason validation, or append-only review persistence.
- Do not expose storage paths, signed URLs, IC values, hashes, or document contents in queue markup or logs.
- Do not add dependencies, routes, migrations, tables, columns, RPCs, or storage policies.
- Reuse `Button`, `AdminConfirmDialog`, `AdminPageShell`, `AdminPageHeader`, `AdminMetricGrid`, and existing semantic design tokens.
- Keep English, Simplified Chinese, and Malay admin locale keys aligned.
- Follow red → green → refactor for the presentation contract before changing production components.

## Exact File Map

### Create

- `components/admin/kyc-review-queue-row.tsx` — compact, stateless queue-row presentation with one review action.
- `components/admin/kyc-review-drawer.tsx` — focused evidence viewer and state-gated decision workflow.
- `components/admin/__tests__/kyc-review-presentation.test.tsx` — queue density and drawer action-gating regression tests.

### Modify

- `app/admin/kyc/page.tsx`
  - `AdminKycPage`
  - `review`
  - `openDocument`
  - pending/info-requested metric derivation
  - queue rendering and selected-case state
- `app/i18n/locales/en/admin.json` — review-row, detail-drawer, waiting-state, and compact filter copy.
- `app/i18n/locales/zh-CN/admin.json` — matching Simplified Chinese keys.
- `app/i18n/locales/ms/admin.json` — matching Malay keys.

### Explicitly Not Touched

- `app/api/admin/kyc/**`
- `app/api/kyc/**`
- `backend/core/types.ts`
- `backend/domains/identity.ts`
- `lib/kyc/**`
- `supabase/**`
- `app/customer/kyc/**`
- admin navigation and unrelated admin pages

## Interfaces

`KycReviewQueueRow` consumes only safe queue data and labels:

```ts
type KycReviewQueueRowProps = {
  user: User;
  submission: AdminKycSubmission;
  submittedLabel: string;
  documentLabel: string;
  statusLabel: string;
  reviewLabel: string;
  onReview: () => void;
};
```

`KycReviewDrawer` consumes the selected case and delegates all external effects:

```ts
type KycReviewDecision = {
  action: "approve" | "reject" | "request_info";
  reasonCode?: KycReviewReasonCode;
  reasonDetail?: string;
};

type KycReviewDrawerProps = {
  user: User | null;
  submission: AdminKycSubmission | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onOpenDocument: (side: "front" | "back") => void;
  onDecision: (decision: KycReviewDecision) => void;
};
```

The parent renders the drawer with a case-specific `key` so switching or reopening a case resets unsent reason state without adding synchronising effects.

## Phase 1: Lock the queue/detail presentation contract with failing tests

**Files:**

- Create: `components/admin/__tests__/kyc-review-presentation.test.tsx`
- Create stubs only as necessary for imports: `components/admin/kyc-review-queue-row.tsx`, `components/admin/kyc-review-drawer.tsx`

- [ ] **Step 1: Write a queue-row test that expects one review action and no inline evidence/decision controls.**

```tsx
const markup = renderToStaticMarkup(
  <KycReviewQueueRow
    user={customer}
    submission={pendingSubmission}
    submittedLabel="Submitted 15 Jul 2026 · Queue position 2"
    documentLabel="MyKad"
    statusLabel="Pending review"
    reviewLabel="Review"
    onReview={() => undefined}
  />,
);

expect(markup).toContain("Customer Bob");
expect(markup).toContain("MyKad");
expect(markup).toContain("Review");
expect(markup).not.toContain("View front");
expect(markup).not.toContain("Approve");
expect(markup).not.toContain("Reject");
```

- [ ] **Step 2: Write drawer tests for status-gated decisions.** Mock `useTranslation` with identity/interpolation output. A `pending` case must render front/back document actions, OCR evidence, and Approve/Request information/Reject. An `info_requested` case must render the waiting message and none of the three decision controls.
- [ ] **Step 3: Run `npx vitest run components/admin/__tests__/kyc-review-presentation.test.tsx` and verify RED because the two components do not exist or do not satisfy the compact contract.**

Expected result: the focused test fails for missing queue/drawer production behavior, not from test setup or translation initialisation.

## Phase 2: Implement compact queue row and focused drawer

**Files:**

- Create: `components/admin/kyc-review-queue-row.tsx`
- Create: `components/admin/kyc-review-drawer.tsx`
- Modify: `app/i18n/locales/en/admin.json`
- Modify: `app/i18n/locales/zh-CN/admin.json`
- Modify: `app/i18n/locales/ms/admin.json`

- [ ] **Step 1: Implement `KycReviewQueueRow` with semantic tokens and one `Button`.** The component must not fetch data, inspect documents, or submit decisions.
- [ ] **Step 2: Implement `KycReviewDrawer` by reusing the existing modal/drawer structure and `AdminConfirmDialog`.** It must:
  - close on backdrop, close button, or Escape when not busy;
  - render a unified Documents section whose available front/back controls call `onOpenDocument`;
  - render OCR status, extracted name, masked document ending, expiry date, and mismatches;
  - expose decisions only when `submission.status === "pending"`;
  - require a reason for Request information/Reject and ten trimmed characters for `other`;
  - call `onDecision` only after the confirmation dialog;
  - disable closing and duplicate submissions while `busy`.
- [ ] **Step 3: Add matching locale keys in all three admin locale files.** Required concepts are `Review`, `Review details`, `Documents`, `Automated checks`, `Waiting for customer`, `Waiting description`, `Close review`, and the pending/info-requested status labels.
- [ ] **Step 4: Re-run `npx vitest run components/admin/__tests__/kyc-review-presentation.test.tsx` and verify GREEN.**

Expected result: all queue and drawer contract cases pass with no warnings.

## Phase 3: Integrate the detail layer into the KYC queue

**Files:**

- Modify: `app/admin/kyc/page.tsx`
- Test: `components/admin/__tests__/kyc-review-presentation.test.tsx`

- [ ] **Step 1: Replace selection/batch state with `selectedReviewUserId: string | null`.** Remove `selectedIds`, `batchBusy`, `PendingAction`, `ConfirmAction`, `applyBatch`, `AdminBatchActionBar`, and inline reason/action markup.
- [ ] **Step 2: Derive actionable metrics explicitly.**

```ts
const queueUsers = users.filter((user) => submissions.has(user.id));
const pendingReview = queueUsers.filter((user) => submissions.get(user.id)?.status === "pending");
const infoRequested = queueUsers.filter((user) => submissions.get(user.id)?.status === "info_requested");
const oldestPendingAt = pendingReview
  .map((user) => submissions.get(user.id)?.submittedAt)
  .filter((value): value is string => Boolean(value))
  .sort()[0];
```

Render `Pending review`, `Information requested`, `Verified users`, and `Oldest queue item` metric cards. Keep `Information requested (count)` as a status-filter option. Remove only the separate verified-users section from this work queue.
- [ ] **Step 3: Render `KycReviewQueueRow` for each filtered case.** `onReview` sets `selectedReviewUserId`; no row checkbox, document button, OCR block, or decision button remains in the list.
- [ ] **Step 4: Render `KycReviewDrawer` for the selected user/submission.** Wire `onOpenDocument` to the unchanged signed-URL flow and `onDecision` to `review`.
- [ ] **Step 5: Adjust `review` so success clears the selected case, removes the processed submission from the map, and preserves existing feedback.** Failure keeps the drawer open and shows the server-safe error.
- [ ] **Step 6: Re-run the focused presentation test and `npx vitest run app/api/admin/kyc/review/__tests__/route.test.ts app/api/admin/kyc/documents/\[submissionId\]/\[side\]/__tests__/route.test.ts`.**

Expected result: presentation tests pass; unchanged review and document authorisation route tests continue to pass.

## Phase 4: Final verification and focused review

- [ ] **Step 1: Run `npm run lint`.** Expected: exit code 0 with no ESLint errors.
- [ ] **Step 2: Run `npx tsc --noEmit`.** Expected: exit code 0 with no TypeScript errors.
- [ ] **Step 3: Run `npm test`.** Expected: exit code 0 and zero failed Vitest tests.
- [ ] **Step 4: Run `npm run verify:i18n`.** Expected: coverage/default-value/lint/status commands exit 0 with no missing or mismatched KYC keys.
- [ ] **Step 5: Perform one focused `luna_worker` read-only review of the final diff for permission regressions, signed-URL/path exposure, and whether any decisions remain reachable from the queue or `info_requested` state.** Treat only confirmed security, privacy, core-flow, or clear requirement violations as must-fix.
- [ ] **Step 6: Inspect `git diff --check` and the final file list before reporting completion.**

## Scope Boundaries

- This change is presentation and interaction restructuring only.
- No assignment/claim feature is introduced because the current backend has no claim contract.
- No review-history API is introduced; the drawer shows only data already present in `AdminKycSubmission`.
- No document image is embedded in the page; existing five-minute signed links continue to open externally.
- No deep-linkable detail route is added.

## New Dependencies

None.

## Database Changes

None.

## Risks and Mitigations

- **Risk: an `info_requested` case becomes accidentally actionable.** Mitigation: drawer component gates all decisions on exact `pending` status and includes a regression test.
- **Risk: a signed storage URL or internal path leaks into queue markup.** Mitigation: queue receives only document-side metadata; the existing signed route remains the sole URL source; focused privacy review checks the diff.
- **Risk: removing batch actions surprises operators.** Mitigation: this is intentional for KYC evidence review; no API is removed, only unsafe queue affordances.
- **Risk: stale selected case after a successful mutation.** Mitigation: success clears `selectedReviewUserId` before/with removing the submission; failure retains context.
- **Risk: untranslated controls.** Mitigation: add identical key shapes across `en`, `zh-CN`, and `ms`, then run the repository i18n verifier.

## Plan Self-Review

- **Scope coverage:** Queue density, detail evidence, status-gated actions, reason/confirmation requirements, metric reduction, batch removal, locales, tests, and security review each have an explicit phase.
- **Placeholder scan:** No `TBD`, `TODO`, deferred implementation instruction, or unspecified dependency remains.
- **Type consistency:** `pending`/`info_requested`, document sides, decision action strings, reason types, and callback signatures match the existing `AdminKycSubmission` and KYC review API contracts.
- **Architecture consistency:** All external effects remain in `AdminKycPage`; both new components are presentation/workflow units and introduce no alternate data path.
