# KYC Queue and Dedicated Review Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan inline. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Awaiting written-plan approval

**Goal:** Make every KYC queue row a stable link to a dedicated submission detail page where evidence, decisions, and terminal outcomes remain reviewable.

**Architecture:** The queue remains a compact client page and links to `/admin/kyc/[submissionId]`. A new admin-only detail API returns one submission plus safe customer identity fields without storage paths; a client detail component loads that DTO, opens documents through the existing audited signed-URL route, submits decisions through the existing review route, then refetches the same submission so the URL remains valid and the terminal status becomes read-only.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase, TailwindCSS, react-i18next, Vitest.

## Context

The compact queue and four metric cards are correct, but the current `KycReviewDrawer` makes complex evidence review a temporary overlay. The user approved the mature queue/detail model used by Ballerine, OpenCRVS, and Medusa: the whole queue row and its trailing `Review` label navigate to one stable detail URL.

The active migration `033_kyc_security_hardening.sql` updates the same KYC submission row from `pending`/`info_requested` to `approved`/`rejected`. Therefore a detail API keyed by submission UUID can refetch the same row after a decision and display its terminal status, reviewer, time, and reason without adding a database migration.

The repository instructions reference `docs/requirements.md`, `docs/architecture.md`, `docs/testing.md`, and `docs/coding-standards.md`, but those files are absent in this checkout. This plan uses the accepted KYC security design, ADR-029, current APIs, current migrations, and existing admin detail-page conventions as local authority.

## Decisions

- Use the stable route `/admin/kyc/[submissionId]`; the route parameter is the KYC submission UUID, not the user ID.
- Make the entire queue row one semantic `Link`. The trailing `Review →` is visual content inside that link, not a nested button.
- Preserve the four metric cards: Pending review, Information requested, Verified users, and Oldest queue item.
- Keep the queue free of document buttons, OCR evidence, decision buttons, checkboxes, and bulk decisions.
- The detail page shows Back to KYC Review, customer identity, status, submitted date/queue position, document links, OCR results, reason/outcome, and the valid decision controls.
- Only exact `pending` status exposes Approve, Request information, and Reject. `info_requested`, `approved`, `rejected`, `superseded`, and `draft` are read-only.
- Approve requires confirmation. Request information and Reject require an allowed structured reason; `other` requires at least ten trimmed characters, followed by confirmation.
- After a successful decision, stay on the same URL, refetch detail, show success feedback, and render the final status read-only.
- Continue opening front/back documents through `/api/admin/kyc/documents/[submissionId]/[side]`; do not embed or persist signed URLs.
- Reuse the same reviewer-role policy as the existing queue API. Do not change `is_admin`, approval authority, self-dealing rules, or the review RPC.

## Alternatives Rejected

1. **Drawer:** preserves queue context but compresses evidence, history, and decisions into an overlay and has no stable URL.
2. **Expandable row:** keeps detail inside the queue and recreates the original information-density problem.
3. **Route-driven drawer:** changes URL while retaining overlay constraints; more implementation complexity without the benefits of a full detail page.

## Global Constraints

- No database migration, schema change, RPC change, storage policy change, or new dependency.
- No storage path, bucket path, IC value, IC hash, signed URL, or raw document content in queue/detail DTOs, props, logs, or page URLs.
- Existing signed-document and structured-review APIs remain the only browser mutation/view paths.
- Use existing admin shell, buttons, confirmation dialog, feedback provider, locale system, and semantic design tokens.
- English, Simplified Chinese, and Malay admin locale key shapes must stay identical.
- Follow red → green → refactor; no production behavior before its focused failing test.
- Keep implementation and final review inside the current feature branch; do not refactor unrelated admin pages.

## Exact File Map

### Create

- `app/admin/kyc/[submissionId]/page.tsx` — route wrapper passing the UUID to the detail component.
- `app/api/admin/kyc/submissions/[submissionId]/route.ts` — authenticated reviewer-only detail DTO endpoint.
- `app/api/admin/kyc/submissions/[submissionId]/__tests__/route.test.ts` — authentication, not-found, and privacy contract tests.
- `components/admin/kyc-review-detail.tsx` — detail loading, evidence presentation, decision workflow, and post-decision refetch.
- `lib/kyc/admin-submission.ts` — shared Supabase select string and row-to-`AdminKycSubmission` mapper for list/detail routes.

### Modify

- `app/admin/kyc/page.tsx` — remove drawer/action state and render queue links.
- `app/api/admin/kyc/submissions/route.ts` — reuse the shared select/mapper without changing response behavior.
- `components/admin/kyc-review-queue-row.tsx` — replace callback/button contract with one semantic `Link`.
- `components/admin/__tests__/kyc-review-presentation.test.tsx` — assert row navigation and dedicated-detail state gating.
- `app/admin/__tests__/filter-consistency.contract.test.ts` — require the dedicated route and forbid drawer integration.
- `backend/core/types.ts` — add the admin-only `AdminKycReviewDetail` DTO.
- `app/i18n/locales/en/admin.json`
- `app/i18n/locales/zh-CN/admin.json`
- `app/i18n/locales/ms/admin.json`
- `Docs/plans/2026-08-24-1458-streamline-kyc-review-queue.md` — this superseding design and implementation plan.

### Delete

- `components/admin/kyc-review-drawer.tsx` — the approved dedicated detail page supersedes the overlay.

### Explicitly Not Touched

- `app/api/admin/kyc/review/route.ts`
- `app/api/admin/kyc/documents/**`
- `app/api/kyc/**`
- `supabase/**`
- `app/customer/kyc/**`
- authentication providers and admin layout
- unrelated admin pages and tests

## Interfaces

Add the admin-only detail contract:

```ts
export interface AdminKycReviewDetail {
  submission: AdminKycSubmission;
  customer: {
    id: string;
    name: string;
    email: string;
    avatarInitial: string;
  };
}
```

Change the queue-row contract to navigation:

```ts
type KycReviewQueueRowProps = {
  user: User;
  submission: AdminKycSubmission;
  submittedLabel: string;
  documentLabel: string;
  statusLabel: string;
  reviewLabel: string;
  href: string;
};
```

The detail endpoint returns only:

```ts
apiOk({
  submission: mapAdminKycSubmission(row),
  customer: { id, name, email, avatarInitial },
});
```

The DTO must never contain `storage_path`, signed URLs, raw IC data, hashes, or document bytes.

## Task 1: Lock navigation and detail contracts with failing tests

**Files:**

- Modify: `components/admin/__tests__/kyc-review-presentation.test.tsx`
- Modify: `app/admin/__tests__/filter-consistency.contract.test.ts`
- Create: `app/api/admin/kyc/submissions/[submissionId]/__tests__/route.test.ts`

- [ ] **Step 1: Change the queue-row presentation test to require one link and no button.**

```tsx
const markup = renderToStaticMarkup(
  <KycReviewQueueRow
    user={customer}
    submission={pendingSubmission}
    submittedLabel="Submitted 15 Jul 2026 · Queue position 2"
    documentLabel="MyKad"
    statusLabel="Pending review"
    reviewLabel="Review"
    href={`/admin/kyc/${pendingSubmission.id}`}
  />,
);

expect(markup).toContain(`href="/admin/kyc/${pendingSubmission.id}"`);
expect(markup.match(/<a/g)).toHaveLength(1);
expect(markup).not.toContain("<button");
```

- [ ] **Step 2: Replace drawer tests with dedicated detail-content tests.** A pending DTO renders document/OCR evidence and three decisions. `info_requested`, `approved`, and `rejected` DTOs render status/outcome copy and no decision controls.
- [ ] **Step 3: Update the admin source contract.** Require `href={`/admin/kyc/${submission.id}`}` and the `[submissionId]` page; forbid `KycReviewDrawer` and selected-review state in the queue page.
- [ ] **Step 4: Add detail-route tests.** Mock authentication and the service client to prove unauthenticated requests return 401, missing rows return 404, a successful response includes customer/submission data, and serialized output contains neither `storage_path` nor a signed URL.
- [ ] **Step 5: Run focused tests and confirm RED.**

Run:

```bash
npx vitest run components/admin/__tests__/kyc-review-presentation.test.tsx app/admin/__tests__/filter-consistency.contract.test.ts 'app/api/admin/kyc/submissions/[submissionId]/__tests__/route.test.ts'
```

Expected: failures identify the callback/button row, missing detail component/route, and missing detail API.

## Task 2: Add shared mapping and the private detail API

**Files:**

- Create: `lib/kyc/admin-submission.ts`
- Create: `app/api/admin/kyc/submissions/[submissionId]/route.ts`
- Modify: `app/api/admin/kyc/submissions/route.ts`
- Modify: `backend/core/types.ts`
- Test: `app/api/admin/kyc/submissions/[submissionId]/__tests__/route.test.ts`

- [ ] **Step 1: Extract the existing list select and mapper unchanged.**

```ts
export const ADMIN_KYC_SUBMISSION_SELECT = "id,user_id,document_type,status,queue_position,created_at,reviewed_at,reviewer_id,review_reason_code,review_reason_detail,kyc_submission_documents(side),kyc_ocr_results(status,holder_name,document_number_last4,expiry_date,confidence,mismatch_fields,processed_at)";

export function mapAdminKycSubmission(row: AdminKycSubmissionRow): AdminKycSubmission {
  return {
    id: row.id,
    userId: row.user_id,
    docType: row.document_type ?? "national_id",
    status: row.status as AdminKycSubmission["status"],
    queuePosition: row.queue_position ?? null,
    submittedAt: row.created_at,
    reviewedAt: row.reviewed_at ?? null,
    reviewedBy: row.reviewer_id ?? null,
    reviewReasonCode: row.review_reason_code ?? null,
    reviewReasonDetail: row.review_reason_detail ?? null,
    documents: (row.kyc_submission_documents ?? []).map(({ side }) => ({ side })),
    ocr: mapOcr(row.kyc_ocr_results?.[0]),
  };
}
```

- [ ] **Step 2: Make the existing list route use the shared constant/mapper.** Preserve its role list, active-status filter, ordering, and response shape.
- [ ] **Step 3: Add `AdminKycReviewDetail` to `backend/core/types.ts`.** Keep customer identity limited to ID, name, email, and avatar initial.
- [ ] **Step 4: Implement `GET /api/admin/kyc/submissions/[submissionId]`.** Authenticate before parameter validation; validate UUID; apply the same `admin/approver/super_admin` role check as the list; query one KYC row by ID with the shared select; query `users` for `id,email,full_name`; return 404 for either missing row; map `name = full_name ?? email` and `avatarInitial` from the name.
- [ ] **Step 5: Run the detail-route test and confirm GREEN.**
- [ ] **Step 6: Commit.**

```bash
git add backend/core/types.ts lib/kyc/admin-submission.ts app/api/admin/kyc/submissions/route.ts 'app/api/admin/kyc/submissions/[submissionId]'
git commit -m "feat(admin): add private KYC detail endpoint"
```

## Task 3: Replace the drawer with a dedicated detail page

**Files:**

- Create: `app/admin/kyc/[submissionId]/page.tsx`
- Create: `components/admin/kyc-review-detail.tsx`
- Delete: `components/admin/kyc-review-drawer.tsx`
- Modify: `components/admin/kyc-review-queue-row.tsx`
- Modify: `app/admin/kyc/page.tsx`
- Modify: three admin locale JSON files
- Test: `components/admin/__tests__/kyc-review-presentation.test.tsx`
- Test: `app/admin/__tests__/filter-consistency.contract.test.ts`

- [ ] **Step 1: Convert `KycReviewQueueRow` into one `Link`.** Use the existing row classes plus hover/focus styles; render `Review` and `ArrowRight` at the trailing edge. Do not render a nested button or click handler.
- [ ] **Step 2: Simplify `AdminKycPage`.** Remove current-user/action feedback imports, review mutation, signed-document opening, selected submission state, and drawer rendering. Pass `href={`/admin/kyc/${submission.id}`}` to each row. Keep loading, search, filters, four metric cards, queue order, and empty state unchanged.
- [ ] **Step 3: Implement `KycReviewDetail`.** It loads `/api/admin/kyc/submissions/${submissionId}` with `cache: "no-store"`; renders loading/error/not-found states; opens documents only by calling the existing signed-document route and immediately passing its returned URL to `window.open`; submits decisions only to `/api/admin/kyc/review`; refetches detail after success.
- [ ] **Step 4: Render the full detail content.** Include Back to KYC Review, customer/status header, submission summary, Documents, Automated checks, and Decision/outcome sections. Use exact `pending` gating; terminal/read-only states show reviewed date, reviewer identifier when present, standard reason text, and optional reason detail.
- [ ] **Step 5: Add the route wrapper.**

```tsx
export default async function AdminKycDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  return (
    <AdminPageShell>
      <KycReviewDetail submissionId={submissionId} />
    </AdminPageShell>
  );
}
```

- [ ] **Step 6: Rename `kyc.drawer.*` locale keys to `kyc.detail.*` in English, Simplified Chinese, and Malay.** Add Back to KYC Review, loading, not found, reviewed time, reviewed by, and outcome copy with identical key shapes.
- [ ] **Step 7: Delete `components/admin/kyc-review-drawer.tsx`.** Confirm `rg -n "KycReviewDrawer|kyc\.drawer" app components` returns no runtime usage.
- [ ] **Step 8: Run the focused presentation and admin contract tests and confirm GREEN.**
- [ ] **Step 9: Commit.**

```bash
git add app/admin/kyc components/admin/kyc-review-detail.tsx components/admin/kyc-review-queue-row.tsx components/admin/__tests__/kyc-review-presentation.test.tsx app/admin/__tests__/filter-consistency.contract.test.ts app/i18n/locales/*/admin.json
git rm components/admin/kyc-review-drawer.tsx
git commit -m "feat(admin): navigate KYC rows to review details"
```

## Task 4: Final verification and focused security review

- [ ] **Step 1: Run focused tests.**

```bash
npx vitest run components/admin/__tests__/kyc-review-presentation.test.tsx app/admin/__tests__/filter-consistency.contract.test.ts 'app/api/admin/kyc/submissions/[submissionId]/__tests__/route.test.ts' app/api/admin/kyc/review/__tests__/route.test.ts 'app/api/admin/kyc/documents/[submissionId]/[side]/__tests__/route.test.ts'
```

- [ ] **Step 2: Run `npx tsc --noEmit`.** Expected: exit code 0.
- [ ] **Step 3: Run `npm run lint`.** Expected: exit code 0; record unrelated existing warnings separately.
- [ ] **Step 4: Run `npm test` once after the final code change.** Expected for affected tests: zero failures; classify repository-baseline failures by file without modifying unrelated code.
- [ ] **Step 5: Run `npm run verify:i18n`.** Require locale coverage and key-shape checks to pass; record unrelated existing strict-default failures separately.
- [ ] **Step 6: Run one `luna_worker` read-only review.** Verify role behavior is unchanged, detail API/DTO never exposes storage paths or signed URLs, document viewing still audits through the signed route, terminal statuses have no decision controls, and no nested interactive element exists in the row link.
- [ ] **Step 7: Run `git diff --check`, inspect the final file list, and commit any verified in-scope repair once.**

## Scope Boundaries

- No assignment/claim system.
- No embedded document images or persistent signed URLs.
- No new KYC history table or migration.
- No server-side change to the existing `info_requested` override behavior; the detail UI remains read-only for that status.
- No change to the four queue metrics or filter behavior.
- No redesign of withdrawals or recommendations.

## New Dependencies

None.

## Database Changes

None.

## Risks and Mitigations

- **Direct URL privacy:** The detail endpoint authorizes before returning customer identity and never selects storage paths. Route tests and luna review enforce this.
- **Terminal-detail continuity:** The review RPC updates the same submission UUID; the detail component refetches that ID and stays on the URL.
- **Nested interaction/accessibility:** The row is one Link with one focus target; Review is text inside it, not a Button.
- **Signed URL leakage:** The DTO carries document sides only. Signed URLs are requested only on click and immediately opened.
- **Role drift:** The new detail route copies the existing list route role policy; changing the known `admin` versus database `is_admin` mismatch is a separate task.
- **Stale drawer code:** The drawer file and all imports/translation keys are removed, with an `rg` verification step.

## Plan Self-Review

- **Spec coverage:** Stable detail URL, whole-row navigation, Back behavior, detail evidence, decisions, terminal states, privacy, locales, TDD, and final review each map to explicit tasks.
- **Placeholder scan:** No deferred marker or unspecified implementation instruction remains.
- **Type consistency:** `submissionId`, `AdminKycReviewDetail`, `AdminKycSubmission`, reason codes, status gating, and API paths are consistent across route, component, tests, and page.
- **Scope check:** One connected KYC admin workflow; no independent subsystem or database work is included.
