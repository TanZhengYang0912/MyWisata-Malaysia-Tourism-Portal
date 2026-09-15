# Dynamic Staff Modules and Roles Design

**Status:** Approved on 2026-09-15
**Research:** `Docs/research/2026-09-15-github-dynamic-module-rbac-patterns.md`

## Problem

MyWisata has normalized staff roles and permissions, but its permission catalogue, role payload validation, Staff destinations, and Admin navigation are still compiled into TypeScript. Catalogue Review still checks a coarse Super Admin role, and the relationship between Catalogue Review and Vendor Approval is not represented as an indivisible domain rule.

## Approved outcome

- Add an independent database-backed Module catalogue.
- Allow Super Admins to create and edit Module metadata from Access Control without schema or TypeScript-enum changes.
- Assign Modules—not hardcoded roles or raw permission enums—to custom Staff Roles.
- Make Catalogue Review and Vendor Approvals one atomic Module group.
- Keep Pending Review/Vendor Approval access dynamically governed through `admin.vendor.manage`; add `admin.catalogue.review` for Catalogue Review.
- Build all Admin sidebar and command-palette navigation entries from effective database Module records.
- Preserve API and database authorization as separate fail-closed checks.

## Architecture

`staff_modules` owns menu and display metadata. `staff_module_permissions` maps each Module to one or more server-owned permission capabilities. `staff_role_modules` stores the selected Modules for each role. `staff_module_groups` and `staff_module_group_members` define atomic groups. Role-write RPCs expand every selected group before persisting role Modules, then derive `staff_role_permissions` so the existing `has_staff_permission()` boundary continues to protect current routes and RLS policies.

`get_my_staff_access()` returns role names, effective permission keys, and effective Module navigation metadata. Super Admin receives every active Module; legacy Admin and Approver compatibility comes from database `staff_module_legacy_roles` rows; custom Staff access comes from active role assignments. The client renders only these returned records.

## Security decisions

1. Menu visibility never authorizes an API call.
2. Module creation may reference only existing permission records.
3. Module routes must be internal `/admin` paths; arbitrary component imports and external URLs are prohibited.
4. Unknown permission/module keys fail closed.
5. Atomic groups are expanded in SECURITY DEFINER role-write RPCs, not only in React state.
6. Catalogue Review GET and POST call `requireStaffPermission("admin.catalogue.review")` before service-role data access.
7. Vendor approval keeps its existing `admin.vendor.manage` guard; the Module group guarantees both capabilities are assigned together.
8. Existing coarse Admin/Approver behavior is preserved through seeded database compatibility mappings.

## No-code boundary

A Super Admin can create a Module over an existing secured `/admin` route, select existing capabilities, assign it to roles, order it, and expose it in the menu without deployment. A genuinely new page, API, or business workflow still requires code and security tests.

## Reuse decisions

- Extend `staff_roles`, `staff_role_assignments`, `staff_role_permissions`, `has_staff_permission()`, and `get_my_staff_access()`.
- Extend the existing Staff Role editor, invitation, and assignment flows.
- Reuse `PortalSidebar`, existing dialogs, filter controls, buttons, audit receipts, and the three admin locale files.
- Replace `NAV_SECTIONS` and `DESTINATIONS` as menu sources.
- Keep a small code-owned Lucide icon registry with a safe fallback; database icon strings are never executable.

**Reuse audit complete.**

## Scope boundaries

In scope: Module CRUD, Module-group display/enforcement, role-module assignment, effective Module projection, dynamic Admin/Staff navigation, Catalogue Review permission enforcement, compatibility seeding, tests, and documentation.

Out of scope: inventing pages from metadata, changing customer/vendor navigation, converting every unrelated Admin API to a new capability in this pass, changing customer entitlements, changing invitation token mechanics, or refactoring unrelated weather/trip work.

## Approved atomic group

`catalogue_governance` contains:

- `vendor_approvals` → `admin.vendor.manage`
- `catalogue_review` → `admin.catalogue.review`

Selecting either Module for a role persists both. Pending Review/Vendor Approvals therefore cannot be separated from Catalogue Review. Other Modules remain independently selectable.
