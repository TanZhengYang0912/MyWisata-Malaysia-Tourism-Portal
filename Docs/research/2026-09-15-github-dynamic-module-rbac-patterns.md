# GitHub patterns for dynamic module and role management

**Status:** Research complete
**Date:** 2026-09-15 (Asia/Kuala_Lumpur)
**Scope:** Read-only architecture research for database-backed modules, dynamic roles, atomic module groups, and permission-filtered admin navigation. No application code was changed.
**Sources:** Official upstream GitHub repositories and source files only.

## Executive conclusion

MyWisata should use a **hybrid database-driven RBAC model**:

1. Store modules, menu metadata, role-module assignments, and atomic module groups in Supabase.
2. Keep executable routes and security-sensitive permission capabilities registered and enforced by application code and PostgreSQL RLS/RPCs.
3. Build the admin sidebar from the current user's effective module records, but never treat a hidden menu as authorization.
4. Let administrators create roles and recombine existing registered modules without deployment or schema changes.
5. Treat “new module without code” as creating/configuring a module over an existing page/API capability. A genuinely new business workflow still requires implementation and security rules.

This matches the strongest parts of Supabase, Frappe, RuoYi, Casbin, and Directus without importing a large authorization framework that does not fit the existing project.

## Current MyWisata evidence

The repository already has a useful RBAC base:

- `supabase/migrations/20260905073000_staff_role_permissions.sql` defines `staff_permissions`, `staff_roles`, `staff_role_permissions`, `staff_role_assignments`, role-management RPCs, and `has_staff_permission`.
- `components/admin/access-control/staff-roles-tab.tsx` already groups permissions and renders multi-select permission checkboxes.
- `lib/staff-permissions/types.ts` and the access-control routes currently hardcode four permission keys.
- `app/admin/layout.tsx` and `lib/staff-permissions/navigation.ts` still hardcode navigation and route mappings.
- Catalogue Review, Pending Review, Support Tickets, Chat Reports, and Refunds still use fixed or coarse role checks in their API routes.

The missing layer is not a replacement auth system. It is a normalized module/menu catalogue, a secure mapping from modules to capabilities, group closure for indivisible modules, and dynamic navigation derived from effective access.

## Reuse audit

| Candidate | Exact path | Reusable part | Decision |
|---|---|---|---|
| Existing staff RBAC tables/RPCs | `supabase/migrations/20260905073000_staff_role_permissions.sql` | Roles, assignments, permission checks, RLS baseline | **Extend**; do not replace |
| Existing role checkbox UI | `components/admin/access-control/staff-roles-tab.tsx` | Multi-select interaction, grouping shell, role CRUD flow | **Extend** with modules/groups |
| Existing server permission helper | `lib/staff-permissions/server.ts` | Central server-side authorization entry point | **Extend** to dynamic keys/effective modules |
| Existing permission types | `lib/staff-permissions/types.ts` | Naming conventions only | **Replace fixed union with validated dynamic records** |
| Existing navigation metadata | `lib/staff-permissions/navigation.ts` | Route normalization/fallback concepts | **Extend or narrow to an allowlist**, not the menu source |
| Existing admin sidebar | `app/admin/layout.tsx` | Rendering, sections, responsive shell | **Reuse rendering; replace hardcoded data source** |
| Generic UI primitives | `components/ui/*` | Checkbox, badge, dialog, form controls | **Reuse** |

**Reuse audit complete.** No standalone module table, module-group relation, or database-driven admin navigation source exists. Those pieces are genuinely new, while the current role management and permission enforcement should be extended.

## Upstream patterns

### Supabase: permissions belong at the database boundary

Supabase's official RBAC guide stores role-permission relationships in PostgreSQL, adds the role to JWT custom claims through an access-token hook, and calls an `authorize(requested_permission)` SQL function from RLS policies. The key lesson is that UI visibility is only presentation; API/database access must independently verify permission.

Source: [Supabase custom-claims RBAC guide](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/api/custom-claims-and-role-based-access-control-rbac.mdx)

**Adopt:** database-backed permission relations, one central authorization function, RLS enforcement.
**Do not copy blindly:** relying only on JWT claims for immediately editable staff access; MyWisata's current database lookup can preserve prompt revocation.

### Frappe: database metadata drives role configuration and visible workspaces

Frappe's Permission Manager loads roles and document types dynamically, while its workspace logic checks both module visibility and allowed roles before returning database-defined pages/sidebar entries.

Sources: [Permission Manager](https://github.com/frappe/frappe/blob/develop/frappe/core/page/permission_manager/permission_manager.py), [permission engine](https://github.com/frappe/frappe/blob/develop/frappe/permissions.py), [workspace visibility and desktop building](https://github.com/frappe/frappe/blob/develop/frappe/desk/desktop.py)

**Adopt:** role UI reads from the catalogue; navigation is built from permitted database records.
**Do not copy blindly:** Frappe's broad DocType framework; MyWisata already has concrete Next.js routes and Supabase tables.

### RuoYi: menu tree, permission identifiers, and role-menu joins

RuoYi persists menus with parent, order, route, visibility, icon, type, and permission identifier. It joins user-role-menu tables to obtain the current user's tree and recursively builds frontend routes. API/controller methods still use permission annotations, so dynamic menus do not replace backend guards.

Sources: [schema](https://github.com/yangzongzhuan/RuoYi-fast/blob/master/sql/ry_20260319.sql), [menu controller](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-admin/src/main/java/com/ruoyi/web/controller/system/SysMenuController.java), [router endpoint](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-admin/src/main/java/com/ruoyi/web/controller/system/SysLoginController.java), [menu service](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-system/src/main/java/com/ruoyi/system/service/impl/SysMenuServiceImpl.java), [menu join query](https://github.com/yangzongzhuan/RuoYi-Vue/blob/master/ruoyi-system/src/main/resources/mapper/system/SysMenuMapper.xml)

**Adopt:** database menu metadata and role-menu joins.
**Adapt for Next.js:** return links and display metadata only. Never store/import arbitrary component paths from the database because App Router pages are compiled code.

### Casbin: compute inherited and grouped access as a closure

Casbin's RBAC model maps subjects to roles and supports transitive role relationships. Its APIs calculate implicit permissions rather than checking only direct assignments.

Sources: [RBAC model](https://github.com/apache/casbin/blob/master/examples/rbac_model.conf), [role manager](https://github.com/apache/casbin/blob/master/rbac/default-role-manager/role_manager.go), [implicit permission APIs](https://github.com/apache/casbin/blob/master/rbac_api.go)

**Adopt:** calculate effective access through a deterministic closure so an atomic group cannot be partially granted.
**Do not add Casbin:** a small SQL relation/RPC is sufficient and avoids a second authorization engine.

### Directus: separate application access from granular data permissions

Directus combines role/policy access with collection/field-level permissions. A 2026 security advisory also demonstrates why broad “minimal app access” defaults can expose more metadata than intended.

Sources: [Directus repository](https://github.com/directus/directus), [permission controller](https://github.com/directus/directus/blob/main/api/src/controllers/permissions.ts), [role creation flow](https://github.com/directus/directus/blob/main/api/src/cli/commands/roles/create.ts), [security advisory GHSA-r9xq-xp38-j4j3](https://github.com/directus/directus/security/advisories/GHSA-r9xq-xp38-j4j3)

**Adopt:** fail closed; menu/app access and data/API permission are separate checks.
**Do not copy blindly:** Directus's generic data-platform policy engine is much larger than this project's needs.

## Recommended MyWisata model

```text
staff_roles
    |
    +-- staff_role_modules -- staff_modules -- staff_module_permissions -- staff_permissions
                                  |
                                  +-- menu metadata (section, label, href, icon, order, active)
                                  |
                                  +-- staff_module_group_members -- staff_module_groups

user -> active role assignments -> selected modules -> atomic-group closure
     -> effective permission keys -> API/RPC/RLS checks
     -> permitted active menu records -> dynamic admin sidebar
```

Recommended responsibilities:

- `staff_modules`: stable key, localized label data, description, section, internal href, whitelisted icon key, order, active/system flags.
- `staff_module_permissions`: maps a visible/business module to one or more security capabilities.
- `staff_role_modules`: administrator-selected module assignments.
- `staff_module_groups` and `staff_module_group_members`: defines indivisible combinations such as Catalogue Review + Vendor Approval.
- `staff_permissions`: remains the security capability catalogue. Permission keys must not become unchecked arbitrary strings at API boundaries.
- effective-access RPCs: normalize group membership on write and calculate effective modules/permissions on read.
- navigation RPC/query: returns only active, permitted modules with valid internal routes, grouped and ordered for the existing sidebar renderer.

For Catalogue Review and Pending Review, create explicit capabilities and make their page/API/RLS checks use the central permission function. Assign those capabilities to module records. A role checkbox toggles the module or its entire locked group; it must not merely hide/show a menu item.

## Three implementation choices

### A. Hybrid module catalogue + capability guards — recommended

Database-driven modules, groups, role assignment, and menus; code/RLS-owned route and data enforcement.

- Meets the requested dynamic role/menu behavior.
- Reuses current MyWisata RBAC.
- Safely supports existing registered functions without code changes to each new role.
- Keeps arbitrary database content from becoming executable code.

### B. RuoYi-style unified menu/permission tree

Store directories, pages, and actions in one hierarchical table and assign tree nodes to roles.

- Simple administration UI and very dynamic menus.
- Risks conflating “can see navigation” with “can access data.”
- Requires careful secondary API/RLS mapping, so it is less natural for the existing schema.

### C. Full no-code module/workflow engine

Build pages, schemas, forms, actions, and policies from metadata.

- Only option that could make genuinely new business functionality zero-code.
- It is a platform rewrite, not an RBAC enhancement, and greatly expands security and maintenance risk.
- Not recommended for this requirement.

## Security invariants

1. A menu record never grants access by itself.
2. Every protected API, server action, RPC, and RLS policy checks the corresponding effective capability.
3. Group closure is enforced by the database write path, not only by linked UI checkboxes.
4. Unknown/inactive modules, permissions, routes, and icon keys fail closed.
5. The database may select an existing internal route from a controlled registry; it may not inject arbitrary component/module imports or external links into privileged navigation.
6. Super-admin bypass, if retained, is explicit and audited.
7. Existing staff receive seeded compatibility roles before old hardcoded checks are removed.

## Recommended scope boundary

“New module without code” should mean:

- no schema rebuild for every role;
- no new TypeScript enum for every role/module combination;
- administrators can register/configure an existing secured capability, compose roles, define atomic groups, and place menu items through the backend;
- newly registered module/menu records appear through the same dynamic query.

It should not mean that a database row can invent a new Next.js page, API implementation, or secure business workflow. Those still need code and tests; after registration, role composition and menu exposure remain no-code.

## Next design decision

Before implementation, confirm the first atomic group. The safest default is **Catalogue Review + Vendor Approval**, with Pending Review remaining independently assignable unless its underlying API/data rules prove inseparable.
