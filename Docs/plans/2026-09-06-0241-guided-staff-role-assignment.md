# Guided Staff Role Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Completed.

**Goal:** Turn Staff Role assignment into a clear three-step flow that previews the exact additive permissions, identifies the selected employee, explains the audit reason, and confirms the consequence before submitting.

**Architecture:** Keep the existing roles, permissions, assignments, staff search, and governed assignment endpoint. Derive the selected role, localized permission labels, and duplicate-assignment state inside `StaffRolesTab`; extend the shared confirmation dialog to accept rich description content without changing existing string-key callers.

**Tech Stack:** React 19, Next.js 16 App Router, TypeScript, TailwindCSS, react-i18next, Vitest custom DOM renderer.

## Global Constraints

- Preserve the current Access Control layout, design tokens, staff candidate eligibility, UUID-only submission, and audited assignment endpoint.
- System preset role definitions remain immutable; custom roles remain editable.
- Assignment is additive and must never claim to replace or remove existing permissions.
- No database, migration, RLS, RPC, API, authorization, dependency, page, route, or permission-catalogue changes.
- Keep unrelated dirty-worktree files untouched.

## Files

### Modify

- `components/admin/access-control/staff-roles-tab.tsx`: `StaffRolesTab`, assignment derivation/state, configured-role cards, guided steps, duplicate detection, confirmation, success copy, labels, and live regions.
- `components/admin/access-control/__tests__/staff-roles-tab.test.tsx`: role preview, `Use this role`, employee selection, rich confirmation, UUID submission, and duplicate prevention.
- `components/admin/confirm-dialog.tsx`: accept either a translation-key string or `ReactNode` as `description`, retaining existing callers.
- `components/shared/__tests__/task5-runtime-behavior.test.tsx`: prove rich confirmation content renders without changing string-key behavior.
- `app/i18n/locales/en/admin.json`, `app/i18n/locales/ms/admin.json`, `app/i18n/locales/zh-CN/admin.json`: guided-step, role-kind, permission-label, empty/duplicate, audit-reason, confirmation, and success copy.
- `Docs/plans/2026-09-06-0241-guided-staff-role-assignment.md`: execution tracking.

### Not touched

- `app/api/admin/access-control/**`
- `supabase/**`
- `lib/staff-permissions/**`
- Other Access Control tabs, navigation, database role names, and existing assignment records.

### Dependencies and database

- New dependencies: none.
- Database changes: none.

### Risks

- Role cards must not imply a system preset is editable; expose separate `Use this role` and custom-only `Edit role` actions.
- Duplicate detection is a client pre-check based on loaded active assignments; the existing database unique constraint remains the concurrency backstop.
- Rich dialog content must remain accessible through `aria-describedby` and must not break the eleven existing string-key callers.
- Search results need a distinct attempted/no-results state so helper copy is not mistaken for a failed search.

---

### Task 1: Lock the guided behavior with failing tests

**Files:**
- Modify: `components/admin/access-control/__tests__/staff-roles-tab.test.tsx`
- Modify: `components/shared/__tests__/task5-runtime-behavior.test.tsx`

**Interfaces:**
- Consumes: existing role, permission, assignment, and candidate fixtures.
- Produces: executable behavior requirements for the component and rich confirmation description.

- [x] **Step 1: Extend the confirmation-dialog mock to render its content**

```tsx
AdminConfirmDialog: ({ open, title, description, confirmLabel, onConfirm }) => open ? (
  <section data-confirm-dialog>
    <h2>{title}</h2>
    <div>{description}</div>
    <button onClick={onConfirm}>{confirmLabel}</button>
  </section>
) : null
```

- [x] **Step 2: Add a failing role-preview test**

Render `StaffRolesTab`; assert `Legacy Wallet Approver` is marked with `systemPreset`, its localized `withdrawalApprove` label and technical key are visible, `useRole` selects `legacy-wallet`, and no edit action is exposed for that system role.

- [x] **Step 3: Add a failing confirmation-flow test**

Select `legacy-wallet`, search `Ali`, choose the candidate, enter `Add a second wallet approver`, click `reviewGrant`, and assert the dialog contains `Ali Staff`, `ali@example.com`, `Legacy Wallet Approver`, `withdrawalApprove`, the reason, and `existingPermissionsUnchanged`. Confirm and assert the POST body stays:

```ts
{
  userId: "22222222-2222-4222-8222-222222222222",
  reason: "Add a second wallet approver",
}
```

- [x] **Step 4: Add a failing duplicate-assignment test**

Load an active assignment for `legacy-wallet` and the Ali UUID, select the same role and employee, then assert `alreadyAssigned` is visible, `reviewGrant` is disabled, and no POST occurs. Also assert a revoked matching assignment does not block re-assignment.

- [x] **Step 5: Add a failing shared-dialog test**

Render `AdminConfirmDialog` with `<strong>Employee and permission summary</strong>` as `description`; assert it is visible and the confirm callback still runs.

- [x] **Step 6: Run RED tests**

Run `npx vitest run components/admin/access-control/__tests__/staff-roles-tab.test.tsx components/shared/__tests__/task5-runtime-behavior.test.tsx`.

Expected: failures for missing role-use action, preview copy, duplicate message, assignment confirmation, and `ReactNode` description support—not setup errors.

---

### Task 2: Implement the guided three-step experience

**Files:**
- Modify: `components/admin/access-control/staff-roles-tab.tsx`
- Modify: `components/admin/confirm-dialog.tsx`
- Modify: `app/i18n/locales/en/admin.json`
- Modify: `app/i18n/locales/ms/admin.json`
- Modify: `app/i18n/locales/zh-CN/admin.json`

**Interfaces:**
- Consumes: `roles`, `permissions`, `assignments`, `assignmentRoleId`, and `selectedStaff` already loaded by `StaffRolesTab`.
- Produces: `selectedAssignmentRole`, `selectedAssignmentPermissions`, `alreadyAssigned`, `useRoleForAssignment(roleId)`, and rich assignment confirmation content.

- [x] **Step 1: Add localized permission resolution**

```ts
const PERMISSION_LABEL_KEYS: Partial<Record<string, string>> = {
  "admin.kyc.review": "accessControl.staffRoles.permissionLabels.kycReview",
  "admin.withdrawal.approve": "accessControl.staffRoles.permissionLabels.withdrawalApprove",
  "admin.vendor.manage": "accessControl.staffRoles.permissionLabels.vendorManage",
  "admin.map_campaign.manage": "accessControl.staffRoles.permissionLabels.mapCampaignManage",
};
```

Resolve mapped labels through `t()` and use the database description or permission key only as fallback.

- [x] **Step 2: Derive role outcome and duplicate state**

```ts
const selectedAssignmentRole = roles.find((role) => role.id === assignmentRoleId) ?? null;
const selectedAssignmentPermissions = selectedAssignmentRole?.permissionKeys.map(resolvePermission) ?? [];
const alreadyAssigned = Boolean(selectedStaff && assignments.some((assignment) =>
  assignment.roleId === assignmentRoleId
  && assignment.userId === selectedStaff.id
  && !assignment.revokedAt));
```

Add `staffSearchAttempted`, `assignmentConfirmOpen`, an employee-search input ref, and assignment-specific feedback state.

- [x] **Step 3: Replace configured-role buttons with inspectable cards**

Each card renders role kind, status, plain-language permission labels plus technical keys, `Use this role`, and a custom-only `Edit role`. `useRoleForAssignment(roleId)` selects the role, clears stale confirmation state, and focuses employee search.

- [x] **Step 4: Build the ordered three-step assignment card**

```tsx
<ol className="space-y-4">
  <li>
    <label htmlFor="assignment-role">{t("accessControl.staffRoles.stepRole")}</label>
    <select id="assignment-role" value={assignmentRoleId} onChange={handleAssignmentRoleChange} />
  </li>
  <li>
    <label htmlFor="staff-search">{t("accessControl.staffRoles.stepEmployee")}</label>
    <form onSubmit={searchStaff}><input id="staff-search" ref={staffSearchInputRef} /></form>
  </li>
  <li>
    <label htmlFor="assignment-reason">{t("accessControl.staffRoles.stepReason")}</label>
    <textarea id="assignment-reason" value={assignmentReason} onChange={handleAssignmentReasonChange} />
  </li>
</ol>
```

Use explicit `id`/`htmlFor` pairs. Keep search inside its own form, add `role="status" aria-live="polite"` to changing result state, and disable review when required data is absent, reason is under 10 trimmed characters, or `alreadyAssigned` is true.

- [x] **Step 5: Add confirmation and specific success feedback**

The review button opens `assignmentConfirmOpen`; only dialog confirmation calls `assignRole()`. The dialog lists employee, email, role, permission labels/keys, governance reason, and the unchanged-permissions note. After success, identify employee and role while preserving the audit-event action.

- [x] **Step 6: Extend `AdminConfirmDialog` compatibly**

```tsx
type Props = {
  open: boolean;
  title: string;
  description: string | React.ReactNode;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

<div id="admin-confirm-description" className="mt-2 text-sm leading-5 text-muted-foreground">
  {typeof description === "string" ? tAdmin(description) : description}
</div>
```

- [x] **Step 7: Add parallel translations**

Add exact EN/MS/zh-CN keys for custom-role guidance, `systemPreset`, `customRole`, `useRole`, `editRole`, the three steps, additive warning, candidate help, selected employee, searching/no results, already assigned, reason help/example, review/grant labels, permission labels, confirmation fields, and assignment-specific success.

- [x] **Step 8: Run focused tests until GREEN**

Run `npx vitest run components/admin/access-control/__tests__/staff-roles-tab.test.tsx components/shared/__tests__/task5-runtime-behavior.test.tsx`.

Expected: both files pass with no new warnings.

---

### Task 3: Verify, review, and commit

**Files:**
- Modify: `Docs/plans/2026-09-06-0241-guided-staff-role-assignment.md`

**Interfaces:**
- Consumes: completed guided UI and tests.
- Produces: verified commit and deployment-ready handoff; no database deployment is needed.

- [x] **Step 1: Verify translations and affected tests**

Run `npm run verify:i18n` and `npx vitest run components/admin/access-control components/shared/__tests__/task5-runtime-behavior.test.tsx`.

Expected: translation coverage succeeds and all affected tests pass. Existing warnings outside owned files are recorded, not repaired.

- [x] **Step 2: Run project checks once after the final code change**

Run `npx tsc --noEmit`, `npm run lint`, and `npm test`.

Expected: zero TypeScript or lint errors and the full test suite passes; pre-existing warnings/skips are reported.

- [x] **Step 3: Perform one focused read-only final review**

Review only the approved Staff Role UI scope for permission semantics, personal-data exposure, explicit labels, keyboard behavior, and absence of API/database changes. Fix only confirmed blockers, then rerun affected verification if code changes.

- [x] **Step 4: Visually verify approved states**

At desktop width, inspect default, selected role, selected employee, confirmation, no-results, already-assigned, and success states. Confirm system presets are inspectable but not editable and localized permission text is primary.

- [x] **Step 5: Inspect and commit only owned files**

Stage only the seven code/locale/test files plus this plan, run `git diff --cached --check`, and commit with `feat: guide staff role assignment`. Unrelated working-tree changes must remain untouched.

## Verification record

- Focused tests: 13 passed across the Staff Roles and shared dialog suites.
- TypeScript: `npx tsc --noEmit` passed.
- Localization: coverage/default-value/lint/status checks passed; 38 pre-existing warnings remained outside the owned files.
- Full lint: passed with 0 errors and 68 pre-existing warnings outside the owned files.
- Full test suite: 593 files passed, 7 skipped; 2,832 tests passed, 20 skipped.
- Browser: verified the Chinese default state, localized permission labels, system-preset boundary, role selection, additive-permission preview, and focus transfer to employee search.
- Focused final review: no confirmed security, privacy, authorization, data-loss, or core-flow blocker.
