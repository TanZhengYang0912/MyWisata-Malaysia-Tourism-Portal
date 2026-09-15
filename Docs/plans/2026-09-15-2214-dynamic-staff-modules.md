# Dynamic Staff Modules and Roles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Implemented and verified on 2026-09-15.

**Verification result:** 18 focused files / 198 tests passed; full Vitest suite passed (766 files, 3,758 tests, 12 files and 42 tests skipped); `npx tsc --noEmit` passed; `npm run lint` passed with pre-existing warnings; focused `git diff --check` passed. The optional i18n aggregate linter remains blocked by an unrelated hardcoded `Mapbox ·` string in the concurrently edited trip planner, while locale parity/default-value checks and the Admin i18n contract pass.

**Goal:** Replace hardcoded Staff/Admin module composition with database-backed Modules, atomic Module groups, dynamic role assignment, dynamic Admin navigation, and explicit Catalogue Review authorization.

**Architecture:** Extend the current staff RBAC rather than replacing it. Roles store Modules; Modules map to server-owned permission capabilities; atomic groups expand inside SECURITY DEFINER RPCs; current `has_staff_permission()` remains the authorization boundary; effective Module records drive the Admin sidebar, command palette, and Staff home.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL/RLS/RPC, TailwindCSS, i18next, Vitest.

## Global Constraints

- Preserve every unrelated dirty-worktree change.
- Add one forward-only migration; do not edit historical migrations.
- Do not add npm dependencies.
- Menu visibility must never replace API/RPC/RLS authorization.
- Database navigation routes must be internal `/admin` paths and icon values must resolve through a code-owned safe registry.
- Existing legacy Admin, Approver, Staff invitation, and Super Admin behavior must remain compatible.
- Catalogue Review + Vendor Approvals is the only atomic group in this release; Pending Review/Vendor Approval remains represented by `admin.vendor.manage`.
- New Module without code means configuring an existing secured route/capability, not generating a new business implementation.

---

## Reuse Decisions

| Candidate | Exact file | Decision | Reason |
|---|---|---|---|
| Staff RBAC schema/RPCs | `supabase/migrations/20260905073000_staff_role_permissions.sql` | Extend through forward migration | Existing roles, assignments, permissions, audit model, and central authorization are correct foundations. |
| Self-access projection | `supabase/migrations/20260906040000_staff_invitations.sql::get_my_staff_access` | Replace definition in forward migration | It is already the authenticated self-only seam used by `/api/auth/me`. |
| Staff server guard | `lib/staff-permissions/server.ts::requireStaffPermission` | Reuse | Catalogue Review can use the existing fail-closed guard. |
| Staff Role editor | `components/admin/access-control/staff-roles-tab.tsx` | Extend | Existing create/edit/invite/assign/audit workflow remains valid. |
| Admin sidebar shell | `components/layout/portal-sidebar.tsx` | Reuse unchanged | It already accepts data-driven sections/items. |
| Fixed Admin navigation | `app/admin/layout.tsx::NAV_SECTIONS` | Replace as source | Database Modules become the single menu catalogue. |
| Fixed Staff destinations | `lib/staff-permissions/navigation.ts::DESTINATIONS` | Replace as source | Effective Module DTOs already contain href/labels/section/order. |
| Fixed permission union | `lib/staff-permissions/types.ts::STAFF_PERMISSION_KEYS` | Replace with validated string type | Role payloads must accept new database records without TypeScript edits. |
| Existing UI primitives | `components/ui/*`, `components/admin/filter-bar.tsx`, `components/admin/confirm-dialog.tsx` | Reuse | No new shared primitive is justified. |

**Reuse audit complete.**

## Files to modify

- `supabase/migrations/20260915222000_dynamic_staff_modules.sql`
- `supabase/migrations/__tests__/20260915222000_dynamic_staff_modules.test.ts`
- `supabase/migrations/__tests__/canonical-history.test.ts`
- `lib/staff-permissions/types.ts`
- `lib/staff-permissions/navigation.ts`
- `lib/staff-permissions/__tests__/types.test.ts`
- `lib/staff-permissions/__tests__/navigation.test.ts`
- `app/api/admin/access-control/staff-modules/route.ts`
- `app/api/admin/access-control/staff-modules/[moduleId]/route.ts`
- `app/api/admin/access-control/staff-modules/__tests__/routes.test.ts`
- `app/api/admin/access-control/staff-roles/route.ts`
- `app/api/admin/access-control/staff-roles/[roleId]/route.ts`
- `app/api/admin/access-control/staff-roles/__tests__/routes.test.ts`
- `components/admin/access-control/types.ts`
- `components/admin/access-control/staff-modules-panel.tsx`
- `components/admin/access-control/staff-roles-tab.tsx`
- `components/admin/access-control/__tests__/staff-roles-tab.test.tsx`
- `app/api/auth/me/route.ts`
- `app/api/auth/me/__tests__/route.test.ts`
- `components/providers/auth.tsx`
- `backend/core/types.ts`
- `app/admin/layout.tsx`
- `app/admin/__tests__/layout.render.test.tsx`
- `app/staff/page.tsx`
- `app/staff/__tests__/page.test.tsx`
- `components/shared/global-command-palette.tsx`
- `app/api/admin/catalogue/reviews/route.ts`
- `app/api/admin/catalogue/__tests__/review-route.contract.test.ts`
- `app/api/__tests__/wallet-approver-boundary.test.ts`
- `app/i18n/locales/en/admin.json`
- `app/i18n/locales/ms/admin.json`
- `app/i18n/locales/zh-CN/admin.json`

## Files and systems not being touched

- Customer and Vendor navigation.
- Customer entitlement/capability tables and resolver.
- KYC evidence, wallet settlement, Stripe/ToyyibPay, refunds, support data, chat data, and recommendation data models.
- Staff invitation token generation, delivery, acceptance, and revocation rules.
- Existing Admin page implementations except Catalogue Review's route guard.
- Unrelated weather, trip-planner, map, routing, package, and E2E changes already present in the worktree.

## Database changes

The forward migration creates `staff_modules`, `staff_module_permissions`, `staff_role_modules`, `staff_module_groups`, `staff_module_group_members`, and `staff_module_legacy_roles`. It seeds the current 21 Admin navigation entries, maps existing secured Modules to permissions, adds `admin.catalogue.review`, seeds the `catalogue_governance` group, and records legacy Admin/Approver visibility mappings.

It adds `validate_staff_module_keys(TEXT[])`, `create_staff_module(...)`, `update_staff_module(...)`, `create_staff_role_with_modules(...)`, and `update_staff_role_with_modules(...)`. Role RPCs validate, deduplicate, expand groups, write `staff_role_modules`, and regenerate `staff_role_permissions` in one transaction. `get_my_staff_access()` is redefined to return `roleNames`, `permissionKeys`, and ordered `modules` for the authenticated user.

## New dependencies

None.

## Risks

- A dynamic menu could expose a page without backend authorization. Mitigation: Catalogue route uses `requireStaffPermission`; other legacy pages retain existing guards, and Module creation can map only known permissions.
- A role could contain half an atomic group. Mitigation: group expansion occurs inside both role-write RPCs and is tested at the SQL contract boundary.
- Existing Admin/Approver menus could disappear. Mitigation: seed `staff_module_legacy_roles` to reproduce current 21/11/1 menu behavior and test exact href lists.
- A malformed database route/icon could break rendering. Mitigation: validate `/admin` hrefs and use a safe icon fallback.
- Invitation snapshots currently contain permission keys. Mitigation: derived `staff_role_permissions` remains populated, preserving the invitation contract.

---

### Task 1: Database Module catalogue and atomic groups

**Files:**

- Create: `supabase/migrations/20260915222000_dynamic_staff_modules.sql`
- Create: `supabase/migrations/__tests__/20260915222000_dynamic_staff_modules.test.ts`
- Modify: `supabase/migrations/__tests__/canonical-history.test.ts`

**Interfaces:**

- Produces `staff_modules`, mapping/group tables, Module governance RPCs, Module-based role RPCs, and the expanded `get_my_staff_access()` JSON contract.
- Preserves `has_staff_permission(UUID, TEXT)` and `staff_role_permissions` for all existing callers.

- [ ] Write a failing migration contract test proving all six tables, constraints, RLS/grants, seeded navigation records, `admin.catalogue.review`, and the `catalogue_governance` two-member group.
- [ ] Run `npx vitest run supabase/migrations/__tests__/20260915222000_dynamic_staff_modules.test.ts` and verify RED because the migration is absent.
- [ ] Write the migration with internal-route validation, Super-Admin-only module writes, module-key validation, group expansion, derived permission synchronization, compatibility mappings, audit rows, and self-only effective access projection.
- [ ] Add the migration filename to `canonical-history.test.ts`.
- [ ] Run both migration tests and verify GREEN.

### Task 2: Dynamic TypeScript contracts and navigation mapper

**Files:**

- Modify: `lib/staff-permissions/types.ts`
- Modify: `lib/staff-permissions/navigation.ts`
- Modify: `lib/staff-permissions/__tests__/types.test.ts`
- Modify: `lib/staff-permissions/__tests__/navigation.test.ts`

**Interfaces:**

```ts
export type StaffPermissionKey = string;
export type StaffModule = {
  id: string;
  key: string;
  label: string;
  description: string | null;
  sectionKey: string;
  sectionLabel: string;
  href: string;
  iconKey: string;
  sortOrder: number;
  groupKey: string | null;
  groupName: string | null;
  permissionKeys: string[];
};
export function isStaffPermissionKey(value: string): value is StaffPermissionKey;
export function parseStaffModules(value: unknown): StaffModule[];
export function staffNavigationSections(modules: readonly StaffModule[]): PortalSidebarSection[];
```

- [ ] Change tests to accept a syntactically valid future permission key and reject malformed values.
- [ ] Add a navigation test using arbitrary database Module records, deterministic section/item ordering, unknown-icon fallback, and empty input.
- [ ] Run focused tests and verify RED against fixed enums/destinations.
- [ ] Implement strict DTO parsing and the safe icon mapper without a hardcoded Module list.
- [ ] Run focused tests and verify GREEN.

### Task 3: Module management API

**Files:**

- Create: `app/api/admin/access-control/staff-modules/route.ts`
- Create: `app/api/admin/access-control/staff-modules/[moduleId]/route.ts`
- Create: `app/api/admin/access-control/staff-modules/__tests__/routes.test.ts`

**Interfaces:**

- `GET /api/admin/access-control/staff-modules` returns `{ modules, permissions, groups }`.
- `POST /api/admin/access-control/staff-modules` calls `create_staff_module` with validated labels/menu metadata/permission keys/group key/reason.
- `PATCH /api/admin/access-control/staff-modules/:moduleId` calls `update_staff_module`.

- [ ] Write route tests for unauthorized fail-closed behavior, dynamic permission strings, exact RPC payloads, and database error mapping.
- [ ] Run the route test and verify RED because routes do not exist.
- [ ] Implement strict Zod request schemas using permission/module key format validation instead of an enum.
- [ ] Run the route tests and verify GREEN.

### Task 4: Module-based role API and editor

**Files:**

- Modify: `app/api/admin/access-control/staff-roles/route.ts`
- Modify: `app/api/admin/access-control/staff-roles/[roleId]/route.ts`
- Modify: `app/api/admin/access-control/staff-roles/__tests__/routes.test.ts`
- Modify: `components/admin/access-control/types.ts`
- Create: `components/admin/access-control/staff-modules-panel.tsx`
- Modify: `components/admin/access-control/staff-roles-tab.tsx`
- Modify: `components/admin/access-control/__tests__/staff-roles-tab.test.tsx`
- Modify: three `app/i18n/locales/*/admin.json` files

**Interfaces:**

- Role payload changes from `permissionKeys` to `moduleKeys`; response retains derived `permissionKeys` and adds `moduleKeys`.
- The editor loads Module records, toggles an entire `groupKey` together, displays a locked-group explanation, and submits exact normalized Module keys.
- `StaffModulesPanel` owns create/edit Module metadata and calls the Module API.

- [ ] Change route tests to prove an unknown-but-valid database Module key reaches the Module-based RPC and malformed/duplicate keys are rejected.
- [ ] Change component tests to prove Catalogue Review and Vendor Approvals check/uncheck together and the saved request contains both Module keys.
- [ ] Run tests and verify RED.
- [ ] Implement API changes, types, Module panel, grouped checkboxes, role summaries, and localized labels.
- [ ] Run route/component tests and verify GREEN.

### Task 5: Effective access and fully dynamic navigation

**Files:**

- Modify: `app/api/auth/me/route.ts`
- Modify: `app/api/auth/me/__tests__/route.test.ts`
- Modify: `components/providers/auth.tsx`
- Modify: `backend/core/types.ts`
- Modify: `app/admin/layout.tsx`
- Modify: `app/admin/__tests__/layout.render.test.tsx`
- Modify: `app/staff/page.tsx`
- Modify: `app/staff/__tests__/page.test.tsx`
- Modify: `components/shared/global-command-palette.tsx`

**Interfaces:**

- `/api/auth/me` returns `staffModules` for Admin, Approver, Staff, and Super Admin identities.
- `AuthContextValue.staffModules` is the only Module/navigation source.
- Admin layout uses `staffNavigationSections(staffModules)`; Staff home renders those same Module records; command palette receives the already-authorized dynamic items.

- [ ] Update auth and layout tests with literal Module records and exact expected menus for Super Admin, Admin, Approver, and Staff.
- [ ] Run the focused tests and verify RED while `NAV_SECTIONS`/`DESTINATIONS` still drive output.
- [ ] Implement the auth DTO, provider state, dynamic sidebar, path redirect checks, Staff home cards, and dynamic command-palette navigation.
- [ ] Remove `NAV_SECTIONS` and `DESTINATIONS` as menu catalogues.
- [ ] Run the focused tests and verify GREEN.

### Task 6: Catalogue Review authorization

**Files:**

- Modify: `app/api/admin/catalogue/reviews/route.ts`
- Modify: `app/api/admin/catalogue/__tests__/review-route.contract.test.ts`
- Modify: `app/api/__tests__/wallet-approver-boundary.test.ts`

**Interfaces:**

- Both Catalogue Review handlers call `requireStaffPermission("admin.catalogue.review")` before any service-role read/write.
- Vendor approval continues calling `requireStaffPermission("admin.vendor.manage")`; the database Module group couples assignment.

- [ ] Write failing authorization tests for denied access before business data and allowed access reaching the service boundary.
- [ ] Run focused tests and verify RED against the current coarse Super Admin guard.
- [ ] Replace the local `requireAdmin()` role query with the existing centralized staff-permission guard and service client after authorization.
- [ ] Run focused tests and verify GREEN.

### Task 7: Focused review and verification

**Files:** All files above; no new production scope.

- [ ] Run the focused RBAC, navigation, auth, Catalogue, and migration tests.
- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint` once after the final change.
- [ ] Run `npm test` once after the final change if the focused/type/lint gates pass within the project timebox.
- [ ] Ask `luna_worker` for one read-only authorization/security review covering group bypass, service-role exposure, route injection, and internal storage/signed-URL leakage; classify only confirmed requirement/security failures as must-fix.
- [ ] Perform at most one focused repair/re-review cycle for confirmed must-fix findings.
- [ ] Re-read this plan and report requirement coverage, verification evidence, unrelated dirty files preserved, and any follow-up items.
