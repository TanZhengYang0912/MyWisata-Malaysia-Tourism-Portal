# Staff Role Assignment UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Implemented and verified locally. Database deployment is pending migration-ledger reconciliation.

**Goal:** Make Staff Roles understandable and usable by enforcing short custom-role metadata, allowing immutable Legacy role templates to be assigned to multiple eligible staff users, and replacing manual UUID entry with name/email search.

**Architecture:** Keep the normalized Staff RBAC model and governed RPC writes. Add one narrowly scoped Super-Admin-only candidate endpoint that uses the existing service client only after the authenticated governance guard succeeds, and returns only active global staff identities. Preserve Legacy role definitions as immutable while allowing their assignment rows to be created and revoked.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL/RLS/RPC, TailwindCSS, i18next, Vitest.

## Context

The current Staff Roles page accepts 100-character names, 1000-character descriptions, and a raw Staff UUID. It lists Legacy roles as assignable, but the database RPC rejects assigning or revoking any system role. The existing `/api/admin/users` cannot supply this picker because `admin_list_users()` deliberately excludes `admin`, `approver`, and `super_admin` users.

## Decisions

- User-created role names are trimmed, required, unique, and limited to 20 characters.
- User-created role descriptions remain optional and are limited to 100 characters.
- Legacy role definitions remain immutable: their names, descriptions, active state, and permission sets cannot be edited.
- Legacy and custom active roles can be assigned to more than one eligible staff user, and individual assignments can be revoked.
- Eligible targets are active users with an unscoped global `admin`, `approver`, or `super_admin` coarse role.
- The picker displays name, email, and coarse roles, but submits only the selected UUID to the existing governed assignment API.
- Candidate search is server-side and restricted to Super Admin. It returns only `id`, `name`, `email`, and `roles`.
- Existing assignments remain additive. This work does not convert customer/vendor/outlet users into staff.

## Scope Boundaries

### Files to modify

- `components/admin/access-control/staff-roles-tab.tsx`
  - `StaffRolesTab`, `RoleForm`, loading/search/selection state, role editor limits, configured-role behavior, and assignment form.
- `components/admin/access-control/types.ts`
  - Add the minimal `StaffRoleCandidate` response type.
- `components/admin/access-control/__tests__/staff-roles-tab.test.tsx`
  - Cover input limits, staff search/selection, UUID submission, Legacy assignment visibility, and immutable Legacy editor behavior.
- `app/api/admin/access-control/staff-roles/route.ts`
  - Change create schema to `name.max(20)` and `description.max(100)`.
- `app/api/admin/access-control/staff-roles/[roleId]/route.ts`
  - Change update schema to the same limits.
- `app/api/admin/access-control/staff-roles/__tests__/routes.test.ts`
  - Cover create/update boundary rejection at 21/101 characters.
- `app/i18n/locales/en/admin.json`
- `app/i18n/locales/ms/admin.json`
- `app/i18n/locales/zh-CN/admin.json`
  - Add picker, selection, empty/error, limits, and System-role copy.
- `supabase/migrations/__tests__/canonical-history.test.ts`
  - Register the forward migration without changing the linked-production baseline snapshot.

### Files to create

- `app/api/admin/access-control/staff-candidates/route.ts`
  - `GET(request)` authenticates with `requireStaffRoleManagementSuperAdmin()`, then uses `createServiceClient()` to resolve only active global staff candidates and filters them by trimmed name/email/UUID search.
- `app/api/admin/access-control/staff-candidates/__tests__/route.test.ts`
  - Cover authorization-before-service access, eligible-role/global-scope filtering contract, minimal response fields, search, and database failures.
- `supabase/migrations/20260906011500_staff_role_assignment_ux.sql`
  - Add custom-role name/description constraints and replace only `assign_staff_role` / `revoke_staff_role_assignment` so system role definitions stay protected while system role assignments are allowed.
- `supabase/migrations/__tests__/20260906011500_staff_role_assignment_ux.test.ts`
  - Prove custom limits, Legacy exemption, governed authorization, assignment eligibility, audit insertion, and absence of `system_role_protected` from assignment/revocation functions.

### Files and systems not being touched

- Historical migration `20260905073000_staff_role_permissions.sql`.
- Coarse `roles` / `user_roles` creation and Wallet Approver management.
- `/api/admin/users`, its privileged-target exclusion, and the Admin Users page.
- Customer entitlements, Access Control capabilities/policies/assignments tabs, navigation rules, and non-staff APIs.
- Existing permission catalogue keys.

### Dependencies

- No new npm dependency.
- Reuse `createServiceClient`, `requireStaffRoleManagementSuperAdmin`, existing form/button styles, i18next, and Vitest DOM helpers.

### Database changes

- One forward-only migration after `20260905075000`.
- Add custom-role-only length constraints; system roles are exempt so `Legacy Wallet Approver` remains valid.
- Preserve `system_role_protected` in `update_staff_role`.
- Remove that rejection only from assignment and revocation RPCs.
- Keep active-target, global coarse-role, Super Admin, uniqueness, and audit requirements unchanged.

### Risks

- Service-role reads could expose privileged identities if the guard is bypassed; tests must prove the service client is never created before the Super Admin guard succeeds.
- Raw PostgREST `.or()` search can be injection-prone; fetch only eligible staff records first, then perform normalized filtering in server code.
- Allowing Legacy assignment revocation must not imply a coarse-role removal. It removes only the dedicated assignment; existing coarse-role compatibility grants remain unchanged.
- Existing custom roles over the new limits could block migration validation. Verify production data before applying the constraint; the current linked database has no custom roles.

---

## Phase 1: Lock the API and database contracts with failing tests

- [x] Add route tests proving 21-character names and 101-character descriptions are rejected for both create and update.
- [x] Add migration contract tests proving limits apply only to custom roles and Legacy assignments are allowed/revokable while Legacy definitions remain immutable.
- [x] Add candidate endpoint tests proving guard-first execution, minimal output, eligible global coarse roles, active users, and failure handling.
- [x] Run the focused tests and confirm each fails for the missing behavior rather than setup errors.

## Phase 2: Enforce role limits and Legacy assignment semantics

- [x] Change create/update Zod schemas to 20/100.
- [x] Add `20260906011500_staff_role_assignment_ux.sql` with custom-role constraints and governed assignment/revocation function replacements.
- [x] Register the migration in canonical history.
- [x] Run route, migration, and canonical-history tests until green.

## Phase 3: Add the staff candidate boundary

- [x] Implement `GET /api/admin/access-control/staff-candidates?search=` with governance guard before service access.
- [x] Resolve global coarse staff role IDs, global assignments, and active target users using minimal column selections.
- [x] Normalize search against name, email, UUID, and role labels; return at most 20 deterministic candidates.
- [x] Run the focused candidate route test until green.

## Phase 4: Replace UUID entry with the staff picker

- [x] Extend the Staff Roles component test fixtures with system/custom roles and candidate responses.
- [x] Add UI tests for Legacy non-editability, Legacy presence in the assignment selector, candidate search, selected identity display, and UUID-only assignment payload; cover length enforcement at the API and database boundaries.
- [x] Implement the search-and-select UI, clear selection after success, and keep assignment disabled until a candidate is selected.
- [x] Add English, Malay, and Simplified Chinese copy.
- [x] Run the focused Staff Roles component test until green.

## Phase 5: Verification and handoff

- [x] Run `npx vitest run components/admin/access-control app/api/admin/access-control supabase/migrations/__tests__/20260906011500_staff_role_assignment_ux.test.ts supabase/migrations/__tests__/canonical-history.test.ts`.
- [x] Run `npm run lint`.
- [x] Run `npx tsc --noEmit`.
- [x] Perform one focused read-only permission/privacy review, classifying findings as must-fix or follow-up.
- [x] Inspect `git diff --check` and the scoped diff; do not include unrelated dirty-worktree changes.
- [x] Commit only the files owned by this plan with a scoped message.
