# Human-Readable Audit Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Approved for execution on 2026-09-08.

**Goal:** Make known Audit Log actions readable in English, Malay, and Simplified Chinese, show important primitive state changes first, and retain sanitized JSON as collapsed technical evidence.

**Architecture:** Add one pure presentation module that maps exact immutable action codes to i18n keys and derives safe primitive change rows from the already-sanitized `AuditRecord` payload. Keep network, authorization, filtering, pagination, and row expansion in `AuditLogTab`; change only its presentation.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, react-i18next, TailwindCSS, Vitest, existing render-test DOM.

## Global Constraints

- Design source: `Docs/superpowers/specs/2026-09-08-human-readable-audit-log-design.md`.
- Use exact action translations; never guess a summary by splitting an unknown code.
- Keep the original action code, actor, target, policy version, trace reference, and timestamp visible.
- Unknown codes render the translated `Unknown audit action` plus the untouched raw code.
- Consume only sanitized `AuditRecord.before` and `AuditRecord.after` data returned by the existing API.
- Add no dependencies, database changes, migrations, API changes, authorization changes, or remote Supabase writes.
- Do not resolve actor UUIDs or expose KYC documents, identity data, storage paths, internal notes, customer messages, or credentials.
- Preserve unrelated dirty-worktree changes and existing design tokens.

## File Map

**Create:**

- `components/admin/access-control/audit-log-presentation.ts` — exact action catalogue and pure change derivation.
- `components/admin/access-control/__tests__/audit-log-presentation.test.ts` — pure catalogue/change tests.
- `components/admin/access-control/__tests__/audit-log-tab.test.tsx` — rendered administrator flow.

**Modify:**

- `components/admin/access-control/audit-log-tab.tsx` — readable action title, key changes, collapsed JSON.
- `app/i18n/locales/en/admin.json`
- `app/i18n/locales/ms/admin.json`
- `app/i18n/locales/zh-CN/admin.json`
- `app/admin/access-control/__tests__/page.contract.test.ts`
- `app/admin/__tests__/sitewide-i18n.contract.test.ts` only if its helper inventory requires the new non-rendering module.

**Do not touch:**

- `app/api/admin/access-control/**`
- `lib/entitlements/**`, `lib/supabase/**`, `supabase/migrations/**`, `backend/**`
- Other admin tabs or KYC domain timelines

## Exact Action Catalogue

Map each exact code below to one explicit `accessControl.audit.actionSummaries.*` key in all three locales:

```text
affiliate.link.disabled
affiliate.link.reenabled
content.approve
content.reject
content.request_changes
entitlement.assignment.revoked
entitlement.assignment.set
entitlement.capability.updated
entitlement.policy.rollback_requested
entitlement.policy_version.activated
entitlement.policy_version.approved
entitlement.policy_version.created
entitlement.shadow_evaluation
kyc.approve
kyc.reject
kyc.request_info
kyc.document_viewed
recommendation.approve
recommendation.reject
recommendation.request_changes
recommendation.converted
staff.invitation.accepted
staff.invitation.claimed
staff.invitation.created
staff.invitation.delivery_failed
staff.invitation.delivery_succeeded
staff.invitation.resent
staff.invitation.revoked
staff.role.assigned
staff.role.created
staff.role.revoked
staff.role.updated
tier.admin_set
vendor.approval_email_sent
vendor.approved
vendor.information_requested
vendor.profile_updated
vendor.rejected
vendor.suspended
vendor.unsuspended
wallet.approver_granted
wallet.approver_revoked
wallet.settings_updated
withdrawal.approval_recorded
withdrawal.approve
withdrawal.callback_queued
withdrawal.execution_failed
withdrawal.hold
withdrawal.payout_retry_requested
withdrawal.processing_started
withdrawal.reject
withdrawal.resume
withdrawal.reviewed
withdrawal.stripe_payout_recorded
withdrawal.submitted
```

No wildcard catalogue entries are permitted.

---

### Task 1: Pure presentation model and tri-lingual catalogue

**Files:**

- Create: `components/admin/access-control/audit-log-presentation.ts`
- Create: `components/admin/access-control/__tests__/audit-log-presentation.test.ts`
- Modify: `app/i18n/locales/en/admin.json`
- Modify: `app/i18n/locales/ms/admin.json`
- Modify: `app/i18n/locales/zh-CN/admin.json`

**Interfaces:**

```ts
export const AUDIT_ACTION_SUMMARY_KEYS: Readonly<Record<string, string>>;
export type AuditPrimitive = string | number | boolean | null;
export type AuditChange = {
  field: string;
  before: AuditPrimitive | undefined;
  after: AuditPrimitive | undefined;
};
export function auditActionSummaryKey(action: string): string;
export function deriveAuditChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AuditChange[];
export function hasTechnicalAuditPayload(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): boolean;
```

- [ ] **Step 1: Write the failing pure tests**

Create `audit-log-presentation.test.ts` with these independent expectations:

```ts
expect(auditActionSummaryKey("kyc.approve")).toBe("kycApprove");
expect(auditActionSummaryKey("future.unmapped_action")).toBe("unknown");
expect(deriveAuditChanges(
  { status: "pending", nested: { secret: "before" } },
  { status: "approved", submissionId: "submission-1", nested: { secret: "after" } },
)).toEqual([
  { field: "status", before: "pending", after: "approved" },
  { field: "submissionId", before: undefined, after: "submission-1" },
]);
expect(hasTechnicalAuditPayload(null, null)).toBe(false);
expect(hasTechnicalAuditPayload(null, {})).toBe(true);
```

- [ ] **Step 2: Run RED**

```bash
npx vitest run components/admin/access-control/__tests__/audit-log-presentation.test.ts --reporter=dot
```

Expected: FAIL because the presentation module does not exist.

- [ ] **Step 3: Implement the exact catalogue and primitive diff**

Define every code in **Exact Action Catalogue** once. Implement:

```ts
function primitive(value: unknown): value is AuditPrimitive {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

export function auditActionSummaryKey(action: string) {
  return AUDIT_ACTION_SUMMARY_KEYS[action] ?? "unknown";
}

export function deriveAuditChanges(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  const fields = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  return fields.flatMap((field) => {
    const previous = before?.[field];
    const next = after?.[field];
    if ((!primitive(previous) && previous !== undefined)
      || (!primitive(next) && next !== undefined)
      || Object.is(previous, next)) return [];
    return [{ field, before: previous as AuditPrimitive | undefined, after: next as AuditPrimitive | undefined }];
  });
}

export function hasTechnicalAuditPayload(before: Record<string, unknown> | null, after: Record<string, unknown> | null) {
  return before !== null || after !== null;
}
```

- [ ] **Step 4: Add the complete locale structure**

Under `accessControl.audit` in all three locale files add:

```json
{
  "actionSummaries": {
    "unknown": "Unknown audit action",
    "kycApprove": "Approved a KYC submission",
    "kycReject": "Rejected a KYC submission",
    "kycRequestInfo": "Requested more KYC information",
    "kycDocumentViewed": "Viewed a KYC document"
  },
  "changeSummary": "Key changes",
  "noChangeSummary": "No summarized field changes",
  "technicalDetails": "Technical details",
  "fieldLabels": {
    "status": "Status",
    "submissionId": "Submission ID",
    "reasonCode": "Reason code",
    "enabled": "Enabled",
    "effect": "Effect",
    "riskLevel": "Risk level",
    "customerVisible": "Customer visible",
    "manuallyAssignable": "Manually assignable",
    "generation": "Generation"
  },
  "valueLabels": {
    "pending": "Pending",
    "approved": "Approved",
    "rejected": "Rejected",
    "info_requested": "Information requested",
    "true": "Yes",
    "false": "No",
    "null": "None",
    "missing": "Not recorded"
  }
}
```

Add a deliberate translated sentence for every catalogue suffix. Required Chinese example values: `批准了 KYC 申请`, `关键变更`, `状态`, `待审核`, `已批准`, `技术详情`, `未知审计操作`. Required Malay example values: `Meluluskan permohonan KYC`, `Perubahan utama`, `Status`, `Menunggu`, `Diluluskan`, `Butiran teknikal`, `Tindakan audit tidak diketahui`.

- [ ] **Step 5: Prove catalogue/locale completeness and GREEN**

Extend the pure test to load all three locale JSON files. For every `AUDIT_ACTION_SUMMARY_KEYS` value, assert a non-empty `accessControl.audit.actionSummaries.<suffix>` string exists in every locale. Assert the three `kycApprove` values differ.

Run the Task 1 test again. Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add components/admin/access-control/audit-log-presentation.ts components/admin/access-control/__tests__/audit-log-presentation.test.ts app/i18n/locales/en/admin.json app/i18n/locales/ms/admin.json app/i18n/locales/zh-CN/admin.json
git commit -m "feat: catalogue human-readable audit actions"
```

---

### Task 2: Render business summaries and secondary JSON evidence

**Files:**

- Create: `components/admin/access-control/__tests__/audit-log-tab.test.tsx`
- Modify: `components/admin/access-control/audit-log-tab.tsx`
- Modify: `app/admin/access-control/__tests__/page.contract.test.ts`
- Modify only if inventory requires: `app/admin/__tests__/sitewide-i18n.contract.test.ts`

**Interfaces:** Consume Task 1 exports. Preserve the public `AuditLogTab({ focus, onViewEntity })` signature.

- [ ] **Step 1: Write the failing rendered administrator test**

Mock the existing audit endpoint with:

```ts
const audit = {
  id: "audit-1",
  actorId: "actor-1",
  action: "kyc.approve",
  entityType: "kyc_submission",
  entityId: "submission-1",
  before: { status: "pending" },
  after: { status: "approved", submissionId: "submission-1", reasonCode: null },
  reason: null,
  createdAt: "2026-09-04T20:51:34.398775+00:00",
};
```

Assert the row contains `Approved a KYC submission` and `kyc.approve`. Click Details and assert `Key changes`, `Pending`, and `Approved` are visible. Find the native `DETAILS` element, assert it does not have an `open` attribute by default, and assert its descendant technical evidence still contains `"submissionId"`. Browser UAT covers opening the native disclosure. Add an unknown row and assert `Unknown audit action` plus its untouched code.

- [ ] **Step 2: Run RED**

```bash
npx vitest run components/admin/access-control/__tests__/audit-log-tab.test.tsx --reporter=dot
```

Expected: FAIL because the row is code-first and JSON is immediately visible.

- [ ] **Step 3: Render localized action summary above raw code**

In `AuditRow`:

```tsx
const actionSummaryKey = auditActionSummaryKey(item.action);
<p className="text-sm font-semibold text-foreground">
  {t(`accessControl.audit.actionSummaries.${actionSummaryKey}`)}
</p>
<p className="mt-1 font-mono text-xs text-muted-foreground">{item.action}</p>
```

Keep the sanitized reason below the raw code.

- [ ] **Step 4: Render key primitive changes**

Add `AuditChangeSummary`, `auditFieldLabel`, and `auditValueLabel`. The component must use `deriveAuditChanges`; translate exact known field/status/boolean/null/missing keys; return an unknown sanitized field name and unknown primitive value unchanged. Show both values as text with an `ArrowRight` icon that is `aria-hidden`.

- [ ] **Step 5: Collapse technical JSON by default**

Wrap the existing Before/After cards in:

```tsx
<details className="rounded-xl border border-border bg-card">
  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-muted-foreground">
    {t("accessControl.audit.technicalDetails")}
  </summary>
  <div className="grid gap-3 border-t border-border p-3 md:grid-cols-2">
    <AuditPayload title={t("accessControl.audit.before")} value={item.before} />
    <AuditPayload title={t("accessControl.audit.after")} value={item.after} />
  </div>
</details>
```

Render it only when `hasTechnicalAuditPayload` is true. Keep the outer row Details button and one-expanded-row behavior.

- [ ] **Step 6: Update contracts and run GREEN**

Require the presentation import, native `<details>`, and raw `item.action` in `page.contract.test.ts`; retain exactly seven headers and seven main row cells. Register the new pure helper in the sitewide i18n inventory only if that existing test fails for it.

```bash
npx vitest run components/admin/access-control/__tests__/audit-log-tab.test.tsx components/admin/access-control/__tests__/audit-log-presentation.test.ts app/admin/access-control/__tests__/page.contract.test.ts app/admin/__tests__/sitewide-i18n.contract.test.ts --reporter=dot
```

Expected: all selected tests PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add components/admin/access-control/audit-log-tab.tsx components/admin/access-control/__tests__/audit-log-tab.test.tsx app/admin/access-control/__tests__/page.contract.test.ts app/admin/__tests__/sitewide-i18n.contract.test.ts
git commit -m "feat: present audit events for administrators"
```

---

### Task 3: Privacy review and final verification

**Files:** No planned production edits. Any confirmed must-fix stays within Task 1/2 files and receives a failing regression test first.

- [ ] **Step 1: Focused privacy and scope review**

Verify no API, database, migration, authorization, or service-role file changed; only sanitized `AuditRecord` values reach presentation code; raw action codes remain visible; unknown actions are not guessed; and technical JSON is collapsed.

- [ ] **Step 2: Run affected tests once after the final code change**

```bash
npx vitest run components/admin/access-control/__tests__/audit-log-tab.test.tsx components/admin/access-control/__tests__/audit-log-presentation.test.ts app/admin/access-control/__tests__/page.contract.test.ts app/api/admin/access-control/__tests__/routes.test.ts app/admin/__tests__/sitewide-i18n.contract.test.ts --reporter=dot
```

Expected: all selected tests PASS with zero failures.

- [ ] **Step 3: Run project verification**

```bash
npx tsc --noEmit
npm run lint
npm run i18n:verify
git diff --check
```

Expected: all commands exit 0. Existing non-blocking warnings/advisories may remain, but touched files introduce no new error.

- [ ] **Step 4: Manual UAT**

```text
1. Sign in as an active global Super Admin.
2. Open Admin → Access Control → Audit Log.
3. Confirm the KYC row shows a readable localized summary with `kyc.approve` below it.
4. Expand it and confirm Status: Pending → Approved appears first.
5. Confirm JSON is hidden initially, then visible after opening Technical details.
6. Repeat in English, Malay, and Simplified Chinese.
7. Confirm filters, pagination, target links, policy version, and trace reference are unchanged.
```

- [ ] **Step 5: Record completion evidence**

Report test counts, TypeScript/lint/i18n results, privacy review, commits, and any UAT step unavailable without a live authenticated browser.

## Verification Matrix

| Requirement | Automated proof | Manual proof |
|---|---|---|
| Known action readable | KYC rendered test | localized row title |
| Raw code retained | row assertion | code below summary |
| State change prominent | Pending → Approved assertion | expanded change card |
| JSON secondary | disclosure test | collapsed then opened |
| Unknown action honest | fallback assertion | unknown fixture |
| Three locales complete | locale catalogue contract | locale switching |
| Privacy preserved | negative sensitive-string checks | no sensitive KYC details |
| Existing behavior intact | read-only/seven-column contracts | filters and navigation |

## Risks and Rollback

- Translation drift is blocked by catalogue completeness tests.
- Dense summaries are limited to changed primitive sanitized fields; nested values stay in JSON.
- Any raw-data fetch or server-boundary change blocks handoff as a privacy regression.
- Unknown future actions use an explicit fallback and untouched raw code.
- Rollback is the two feature commits; no database rollback is required.
