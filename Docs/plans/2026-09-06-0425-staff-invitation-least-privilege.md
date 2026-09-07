# Staff Invitation and Least-Privilege Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Implemented, verified, and deployed to the linked Supabase project; live SMTP recipient smoke test remains pending a dedicated test recipient.

**Goal:** Let a Super Admin email a seven-day Staff Role invitation to a new dedicated employee account, let the verified recipient explicitly accept it, and give that Staff identity access only to the four work areas represented by active Staff Role assignments.

**Architecture:** Extend the existing Staff RBAC tables with a governed invitation aggregate and transactional acceptance RPC. Reuse the SMTP sender, auth callback, and Outlet Manager invitation UX patterns, but add a new coarse `staff` identity whose effective permissions—not the coarse role—drive Staff navigation and every protected API/database boundary. Keep role creation, new-employee invitation, and joined-employee assignment as separate UI responsibilities.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL RLS and SECURITY DEFINER RPCs, Nodemailer SMTP, TailwindCSS, react-i18next, Vitest.

## Global Constraints

- Supported Staff permissions remain exactly `admin.kyc.review`, `admin.withdrawal.approve`, `admin.vendor.manage`, and `admin.map_campaign.manage`.
- A global `staff` role grants shell eligibility only; it grants no business operation without an active Staff Role assignment.
- Reject every invitation email already carrying a Customer, Vendor Owner, Outlet Manager, Staff, Admin, Approver, or Super Admin role.
- Normalize email with `trim().toLowerCase()` only; do not collapse Gmail dots or `+tag` aliases.
- Invitations expire after seven days. Resend rotates the token and invalidates all older links.
- Store only SHA-256 token hashes. Never return or persist raw tokens outside the SMTP message.
- Governance and revocation reasons are 10–500 characters, audited, and excluded from recipient email.
- Preserve existing Legacy Admin, Legacy Wallet Approver, Super Admin, Vendor, Outlet Manager, and Customer behavior.
- Reuse current design tokens and i18n namespaces. Add no dependency.
- Preserve all unrelated dirty-worktree edits, including the existing `WalletTransaction.walletId` change in `backend/core/types.ts`.

## Files

### Create

- `supabase/migrations/20260906040000_staff_invitations.sql`: Staff role seed, invitation table, lifecycle RPCs, auth provisioning, self-permission projection, and permission compatibility.
- `supabase/migrations/__tests__/20260906040000_staff_invitations.test.ts`: static migration security/state-machine contract.
- `lib/staff-invitations/types.ts`: shared invitation, employee, and delivery DTOs.
- `lib/staff-invitations/server.ts`: email normalization/token/origin/error helpers and SMTP orchestration.
- `lib/staff-invitations/__tests__/server.test.ts`: token/origin/normalization/error tests.
- `lib/email/staff-invitation.ts`: localized safe HTML/text invitation rendering.
- `lib/email/__tests__/staff-invitation.test.ts`: email content and privacy tests.
- `app/api/admin/access-control/staff-invitations/route.ts`: Super Admin list/create.
- `app/api/admin/access-control/staff-invitations/[invitationId]/resend/route.ts`: governed resend.
- `app/api/admin/access-control/staff-invitations/[invitationId]/revoke/route.ts`: governed revoke.
- `app/api/admin/access-control/staff-invitations/__tests__/routes.test.ts`: guard, validation, SMTP, response secrecy, resend/revoke tests.
- `app/api/staff-invitations/[token]/route.ts`: no-store public preview and authenticated acceptance.
- `app/api/staff-invitations/[token]/__tests__/route.test.ts`: preview/acceptance/error/privacy tests.
- `app/staff-invitations/[token]/page.tsx`: recipient review, password/Google auth, verification, switch-account, and acceptance page.
- `app/staff-invitations/[token]/__tests__/page.test.tsx`: recipient state tests.
- `app/staff/page.tsx`: Staff home and authorized work cards.
- `app/staff/__tests__/page.test.tsx`: permission-card and empty-state tests.
- `lib/staff-permissions/navigation.ts`: deterministic permission-to-route/nav mapping.
- `lib/staff-permissions/__tests__/navigation.test.ts`: route allow/deny matrix.
- `app/api/admin/vendors/route.ts`: Staff-permission-guarded vendor review list projection.
- `app/api/admin/vendors/__tests__/route.test.ts`: vendor list authorization/projection tests.

### Modify

- `backend/core/types.ts`, `lib/constants.ts`, `lib/auth/demo-user-role.ts`, `lib/auth/post-login-destination.ts`, `app/page.tsx`: add `staff` identity and `/staff` destination.
- `app/api/auth/me/route.ts`, `components/providers/auth.tsx`: expose self-only Staff Role names and effective permission keys.
- `app/auth/callback/route.ts`, `app/login/page.tsx`: preserve sanitized Staff invitation return paths and recognize Staff without exposing it as a demo account.
- `lib/email/sender.ts`: add `sendStaffInvitationEmail()` through the existing transport.
- `components/admin/access-control/types.ts`: invitation and joined-employee DTOs.
- `components/admin/access-control/staff-roles-tab.tsx`: replace the ambiguous existing-assignment card with separate invitation and employees/permissions surfaces.
- `components/admin/access-control/__tests__/staff-roles-tab.test.tsx`: invitation review/send, pending state, joined employee assignment/revocation.
- `app/api/admin/access-control/staff-roles/route.ts`: include joined employee identity/assignment summaries.
- `app/api/admin/access-control/staff-candidates/route.ts`: include the `staff` coarse identity for existing Staff management only.
- `app/api/admin/access-control/staff-roles/[roleId]/assignments/route.ts`: preserve governed assignment API for joined Staff.
- `app/api/admin/access-control/staff-roles/__tests__/routes.test.ts`, `app/api/admin/access-control/staff-candidates/__tests__/route.test.ts`: Staff eligibility/list coverage.
- `app/admin/layout.tsx`, `app/admin/__tests__/layout.contract.test.ts`, `app/admin/__tests__/layout.render.test.tsx`: permission-derived Staff mode; no counts, global search, or unrelated nav.
- `app/api/admin/kyc/submissions/route.ts`, `app/api/admin/kyc/submissions/[submissionId]/route.ts`, `app/api/admin/kyc/documents/[submissionId]/[side]/route.ts` and their tests: use `requireStaffPermission('admin.kyc.review')` before service access.
- `app/api/admin/withdrawals/route.ts`, `app/api/admin/withdrawals/[id]/route.ts`, `app/api/admin/withdrawals/[id]/hold/route.ts`, `reject/route.ts`, `resume/route.ts` and their tests: use `requireStaffPermission('admin.withdrawal.approve')` before parsing or work; retain Super Admin-only fraud override and payout controls.
- `app/admin/vendors/page.tsx`: consume the new guarded vendor-list API instead of browser-side multi-table queries.
- `app/api/admin/vendors/[id]/approval-email/route.ts`, `draft/route.ts`, `approve/route.ts`, `suspend/route.ts`, `link-recommendation/route.ts`, `recommendation-invite/route.ts`, `recommendation-invite/draft/route.ts` and affected tests: consistently require `admin.vendor.manage` before protected reads or writes.
- `app/i18n/locales/en/admin.json`, `ms/admin.json`, `zh-CN/admin.json`, `en/auth.json`, `ms/auth.json`, `zh-CN/auth.json`: Staff identity, invitation, acceptance, employee, permission, delivery, and error copy.
- `Docs/plans/2026-09-06-0425-staff-invitation-least-privilege.md`: execution checkboxes and verification evidence.

### Explicitly not touched

- Customer, Vendor Owner, and Outlet Manager invitation/onboarding behavior.
- Refund, catalogue, support, chat report, affiliate, chatbot, AI assistant, user-management, wallet-settings, payout-report, recommendation, and Staff Conduct permission catalogues.
- Existing unrelated demo-data, checkout, cart-ordering, AI-assistant, and page-shell changes in the dirty worktree.
- Dependency manifests unless an existing test command proves a script-only correction is required; no package installation is planned.

### Database changes

- Add coarse role row `staff`.
- Add `public.staff_invitations`, partial unique indexes, RLS, and browser grants/revocations.
- Add governed prepare/resend/revoke/accept/delivery-finalization RPCs and self-only Staff permission projection.
- Replace `handle_new_auth_user()` so a matching unexpired pending Staff invite creates a roleless claimed identity instead of Customer, while all normal signups remain Customer.
- Extend `has_staff_permission()`, `can_review_kyc()`, KYC actor resolution, and withdrawal approver compatibility to recognize assigned Staff without broadening `is_admin()`.
- Extend `assign_staff_role()` target eligibility from legacy coarse staff to `staff`.

### Risks

- Auth trigger regression could accidentally remove Customer role provisioning; a migration contract and database replay check are mandatory.
- Service-role reads must occur only after Super Admin or Staff permission guards.
- SMTP is not transactional; stale `sending` is treated as unknown and resend rotates the link.
- A revoked invite with an already-created roleless identity must atomically rebind only that same email and only while it remains roleless.
- Adding `staff` to shared role unions can silently affect exhaustive records and demo role priority.
- The vendor review page currently reads several tables in the browser; moving it behind an API must preserve its filters/pagination without exposing owner data.

---

### Task 1: Lock and implement the database invitation boundary

**Files:**
- Create: `supabase/migrations/__tests__/20260906040000_staff_invitations.test.ts`
- Create: `supabase/migrations/20260906040000_staff_invitations.sql`

**Interfaces:**
- Produces RPCs `prepare_staff_invitation(TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ)`, `prepare_staff_invitation_resend(UUID, TEXT, TIMESTAMPTZ)`, `finalize_staff_invitation_delivery(UUID, TEXT, BOOLEAN)`, `revoke_staff_invitation(UUID, TEXT)`, `accept_staff_invitation(TEXT)`, and `get_my_staff_access()`.
- Produces lifecycle rows keyed by UUID with only `token_hash`, never raw token.

- [x] **Step 1: Write the failing migration contract**

Assert the migration contains the `staff` role seed, invitation constraints/indexes, RLS with no anon table grant, token-hash parameters, role/email/snapshot checks, `FOR UPDATE`, Customer-role bypass only for a live Staff invite, verified-email acceptance, terminal accepted/revoked states, and audit inserts. Assert it does not contain an `invite_url` or `raw_token` column.

- [x] **Step 2: Run the migration test RED**

Run: `npx vitest run supabase/migrations/__tests__/20260906040000_staff_invitations.test.ts`

Expected: FAIL because the migration does not exist.

- [x] **Step 3: Implement the schema and lifecycle RPCs**

Use the exact table core:

```sql
CREATE TABLE public.staff_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_email TEXT NOT NULL,
  claimed_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  staff_role_id UUID NOT NULL REFERENCES public.staff_roles(id) ON DELETE RESTRICT,
  role_name_snapshot TEXT NOT NULL,
  permission_keys_snapshot TEXT[] NOT NULL,
  invited_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  revoked_reason TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','revoked')),
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('pending','sending','sent','failed')),
  send_attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  accepted_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`accept_staff_invitation()` must lock by token hash, require `email_confirmed_at`, compare normalized email, compare current sorted permission keys/name with snapshots, insert the global `staff` role and one Staff Role assignment, mark accepted, and audit in one transaction.

- [x] **Step 4: Update auth provisioning and permission compatibility**

In `handle_new_auth_user()`, lock one unexpired pending invitation by normalized email. When found, create/update `public.users`, bind `claimed_by`, create the wallet for compatibility, and skip Customer role insertion. Otherwise execute the unchanged Customer path. Make `has_staff_permission()` accept coarse `staff`; keep Super Admin implicit. Make `can_review_kyc()` and withdrawal `is_approver()` delegate only to the matching permission for Staff while retaining legacy results.

- [x] **Step 5: Run migration contract GREEN**

Run the Task 1 Vitest file and `git diff --check`.

Expected: PASS and no whitespace errors.

---

### Task 2: Implement safe tokens, trusted origin, and real invitation email

**Files:**
- Create: `lib/staff-invitations/types.ts`
- Create: `lib/staff-invitations/server.ts`
- Create: `lib/staff-invitations/__tests__/server.test.ts`
- Create: `lib/email/staff-invitation.ts`
- Create: `lib/email/__tests__/staff-invitation.test.ts`
- Modify: `lib/email/sender.ts`

**Interfaces:**
- Produces `normalizeStaffInvitationEmail(email)`, `createStaffInvitationToken()`, `hashStaffInvitationToken(token)`, `staffInvitationOrigin(env)`, `buildStaffInvitationUrl(origin, token)`, `sendStaffInvitationEmail(input)`.

- [x] **Step 1: Write RED tests**

Cover trim/lowercase without dot/plus collapsing, 32-byte randomness, SHA-256 hash, rejection of missing/untrusted origins, localhost HTTP allowance, production HTTPS enforcement, HTML escaping, Malaysia expiry display, localized permission labels, and absence of governance reason/UUID/technical keys.

- [x] **Step 2: Run RED tests**

Run: `npx vitest run lib/staff-invitations/__tests__/server.test.ts lib/email/__tests__/staff-invitation.test.ts`

Expected: FAIL on missing modules.

- [x] **Step 3: Implement helpers and renderer**

Use `randomBytes(32).toString('hex')`, `createHash('sha256')`, and only `NEXT_PUBLIC_SITE_URL` from server environment. Reuse `escapeHtml()` and the existing Nodemailer transport through:

```ts
export type SendStaffInvitationEmailInput = StaffInvitationEmailInput & { to: string };
export function sendStaffInvitationEmail(input: SendStaffInvitationEmailInput) {
  return sendRenderedEmail(input.to, renderStaffInvitationEmail(input));
}
```

- [x] **Step 4: Run helper/email tests GREEN**

Expected: all Task 2 tests pass.

---

### Task 3: Add guarded Super Admin invitation APIs

**Files:**
- Create: administrative invitation routes and `app/api/admin/access-control/staff-invitations/__tests__/routes.test.ts` listed above.
- Modify: `app/api/admin/access-control/staff-roles/route.ts`, `staff-candidates/route.ts`, and their tests.

**Interfaces:**
- Consumes Task 1 RPCs and Task 2 SMTP helpers.
- Produces JSON summaries with `id`, email, role snapshot, permissions, lifecycle state, delivery state, attempts, and expiry. No response contains a token or URL.

- [x] **Step 1: Write guarded route tests**

Test guard-before-parse/service/SMTP, strict Zod bodies, role-bearing email conflict, duplicate pending conflict, roleless rebind, prepare→SMTP→finalize ordering, sanitized SMTP failure, stale-sending unknown display, resend cooldown/rotation, revoke reason, and token/URL absence.

- [x] **Step 2: Run route tests RED**

Expected: missing route modules or handlers.

- [x] **Step 3: Implement list/create/resend/revoke**

All routes start with `requireStaffRoleManagementSuperAdmin()`. Only after success may they create a service client or send SMTP. Creation/resend returns:

```ts
return apiOk({
  id: prepared.id,
  status: prepared.status,
  deliveryStatus,
  expiresAt: prepared.expires_at,
}, { status: created ? 201 : 200 });
```

- [x] **Step 4: Extend existing-employee data**

Allow `staff` in Staff candidate eligibility and include employee name/email plus active assignments in the Staff Roles GET response. Do not make system role definitions editable.

- [x] **Step 5: Run administrative API tests GREEN**

Run all Staff invitation, Staff Role, and Staff candidate route tests.

---

### Task 4: Implement recipient preview, registration, OAuth, and acceptance

**Files:**
- Create: recipient API/page/test files listed above.
- Modify: `app/auth/callback/route.ts`, `lib/auth/post-login-destination.ts`, `app/login/page.tsx`, and their tests.

**Interfaces:**
- GET returns the invited email, role name, human-readable permissions, expiry, and safe state with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
- POST requires a verified matching authenticated identity and calls `accept_staff_invitation(hash)`.

- [x] **Step 1: Write RED route and UI tests**

Cover invalid/expired/revoked/used/role-changed links, no-store headers, signed-out review, fixed invited email, sign-in, name/password registration, verification pending/resend, Google return path, wrong-session switch account, acceptance, and redirect `/staff`.

- [x] **Step 2: Implement preview and acceptance route**

Hash the path token immediately, query only by hash through the server, never log the path, map database errors to stable non-enumerating codes, and never return governance reason or technical permission keys.

- [x] **Step 3: Implement the recipient page**

Reuse password policy and Supabase auth calls from `app/login/page.tsx`. Use the exact callback target `/auth/callback?next=/staff-invitations/[token]`; do not store the token in local/session storage.

- [x] **Step 4: Preserve the safe return path**

Add only `/staff-invitations/` to the invitation allowlist in `postLoginDestination()`. Keep arbitrary `next` values mapped to role homes.

- [x] **Step 5: Run recipient/auth tests GREEN**

Expected: Task 4 suites pass.

---

### Task 5: Add Staff identity, self-access projection, home, and shell

**Files:**
- Create: `lib/staff-permissions/navigation.ts`, its test, `app/staff/page.tsx`, its test.
- Modify: role/auth/layout files listed in the Files section.

**Interfaces:**
- `AuthContextValue` adds `staffPermissionKeys: StaffPermissionKey[]` and `staffRoleNames: string[]`.
- `staffNavigationFor(permissionKeys)` returns only the four allowed work links.
- `staffCanAccessPath(permissionKeys, pathname)` returns false for every unrelated Admin route.

- [x] **Step 1: Write RED exhaustive-role and nav tests**

Assert `staff` resolves to `/staff`, has priority below Super Admin/Admin/Approver but above Customer, can preserve only invitation return paths, and maps each permission to exactly one work area.

- [x] **Step 2: Add `staff` to shared role contracts**

Update every exhaustive `Record<Role, ...>` and `ROLE_NAMES`. Keep demo account endpoints from fabricating Staff users.

- [x] **Step 3: Expose self-only effective access**

Call `get_my_staff_access()` from `/api/auth/me`; return empty arrays for non-Staff. Populate the provider fields without exposing assignment rows belonging to other people.

- [x] **Step 4: Implement `/staff` and Staff-mode Admin layout**

Allow `useRequireRole(['admin','approver','super_admin','staff'])`. For Staff, block rendering children unless `staffCanAccessPath()` succeeds, hide counts/search/command palette, and render only `staffNavigationFor()`. Legacy roles keep existing behavior.

- [x] **Step 5: Run role/auth/layout/home tests GREEN**

Expected: all Task 5 targeted suites pass.

---

### Task 6: Replace ambiguous Staff assignment UX with invitation and employee management

**Files:**
- Modify: `components/admin/access-control/staff-roles-tab.tsx`, its test, `types.ts`, and six locale JSON files.

**Interfaces:**
- Consumes Task 3 invitation summaries and joined employee summaries.
- Reuses existing role create/update and assignment/revocation endpoints.

- [x] **Step 1: Write RED component tests**

Assert three distinct areas: create custom role, invite new employee, employees and permissions. Verify invitation review includes fixed email/role/human labels/seven-day expiry but excludes governance reason from recipient content; send success shows delivery; failed/unknown supports resend; revoke requires a new reason; existing Staff role adjustment remains additive.

- [x] **Step 2: Implement invitation card**

Fields are active role, email, and governance reason. Review dialog submits POST only after confirmation. Never show or copy an invite URL.

- [x] **Step 3: Implement employee and pending-invite management**

List joined Staff separately from pending/history invitations. Assignment chooses an existing joined employee; resend and revoke act only on invitation IDs.

- [x] **Step 4: Add English, Malay, and Chinese copy**

Add the same keys to all locale files and run `npm run verify:i18n`.

- [x] **Step 5: Run Staff Roles UI tests GREEN**

Expected: component and i18n tests pass.

---

### Task 7: Close every operational permission seam

**Files:**
- Modify/create the KYC, withdrawal, vendor, sponsored-placement, layout, and route tests listed above.

**Interfaces:**
- Every protected handler calls `requireStaffPermission(key)` before parsing, service-client construction, signed URL creation, or data query.

- [x] **Step 1: Write authorization matrix tests**

For each permission, assert its list/detail/mutation/supporting endpoints succeed with that permission and return 403 without it. Assert a Staff identity with one permission cannot access the other three modules. Assert Super Admin and legacy role regressions remain green.

- [x] **Step 2: Gate KYC reads and documents**

Replace ad-hoc `can_review_kyc` route checks with `requireStaffPermission('admin.kyc.review')`; retain database assignment/self-dealing checks and 300-second signed URLs.

- [x] **Step 3: Gate withdrawal reads and ordinary review actions**

Use `requireStaffPermission('admin.withdrawal.approve')` for list/detail/approve/reject/hold/resume. Keep fraud override and payout retry at their stricter existing authority unless their RPC explicitly authorizes Staff.

- [x] **Step 4: Gate vendor list and supporting actions**

Move vendor list/filter queries into `app/api/admin/vendors/route.ts`; update the page to call it. Add the same permission guard to approval/suspension and email/recommendation support routes.

- [x] **Step 5: Confirm sponsored placement seams**

Retain existing permission guards and add missing direct-route denial assertions.

- [x] **Step 6: Run the four-module authorization suites GREEN**

Expected: all affected API/page tests pass.

---

### Task 8: Final verification, database deployment, and bounded security review

**Files:**
- Modify: this plan only for evidence/checkmarks unless a confirmed must-fix defect is found.

- [x] **Step 1: Run targeted tests once after the final code change**

Run the Staff invitation/RBAC/auth/layout/i18n/KYC/withdrawal/vendor/sponsored suites from Tasks 1–7.

- [x] **Step 2: Run repository checks**

Run `npx tsc --noEmit`, `npm run lint`, and `npm run verify:i18n`.

Expected: TypeScript and i18n pass; ESLint has zero errors. Pre-existing warnings must be reported separately and not expanded into unrelated cleanup.

- [x] **Step 3: Run a fresh read-only permission/privacy review**

Use `luna_worker` to verify no raw token/URL escapes API or logs, no service client precedes authorization, Staff nav/API paths fail closed, and signed KYC URLs expose no internal storage path. Fix only confirmed must-fix security/privacy/authorization/core-flow violations, then perform at most one focused re-review.

- [x] **Step 4: Apply the migration to the linked Supabase project**

Run `supabase migration list`, then `supabase db push` only if the linked local/remote histories are aligned. Re-run `supabase migration list` and confirm `20260906040000` is present locally and remotely.

- [ ] **Step 5: Smoke-test the core flow**

With SMTP configured, create an invitation using a new dedicated email, verify only a summary returns, open the emailed link, register/verify or Google-sign-in with the matching email, accept, reach `/staff`, and confirm only the assigned work card/API is available. If SMTP credentials or a disposable email are unavailable, stop before sending and report the exact external prerequisite.

- [x] **Step 6: Record evidence and hand off**

Execution evidence (2026-09-06):

- Targeted Staff/RBAC/API/UI verification: 47 files, 378 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with 67 pre-existing warnings and no errors.
- `npm run verify:i18n`: passed with complete English/Malay/Chinese coverage and 38 pre-existing punctuation-style warnings.
- Independent least-privilege/privacy review found two must-fix issues (token-page referrer policy and roleless OAuth fallback); both were fixed and their focused tests passed before the final suite.
- Linked Supabase migration history was aligned before deployment; `20260906040000_staff_invitations.sql` was applied successfully and the follow-up migration list confirmed `20260906040000` locally and remotely.
- The Access Control Staff Roles screen was refreshed against the deployed database: invitation loading succeeded, permissions and Legacy copy-only templates loaded, and the joined-employee section populated.
- A real recipient email was not provided, so no live SMTP invitation was sent during verification.

Update this plan's status and checkboxes, commit only in-scope files, and report migration state, test results, any pre-existing warnings, and any external smoke-test limitation.
