# User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Add a super-admin-only User Management area between Catalogue Review and KYC Review for paginated user administration, Bio restriction clearing, account suspension, reversible soft deletion, restoration, audit logging, and user notifications.

**Architecture:** Keep User Management isolated behind `/api/admin/users` and a new `/admin/users` page. Server-side pagination/filtering is implemented by a security-definer Supabase RPC; all mutations go through a separate security-definer RPC that enforces super-admin access, protects privileged accounts, preserves financial/KYC data, writes audit/notification rows, and returns a safe summary. The API queues account-status emails through the existing email outbox without exposing sensitive KYC data.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/Postgres RPCs and RLS, Zod, Vitest, existing Tailwind UI components, Nodemailer email outbox.

## Global Constraints

- User Management is visible and callable only by `super_admin`; do not change existing `approver` permissions in other modules.
- Display ordinary users only (`customer`, `vendor_owner`, `outlet_manager`); never list or mutate `admin`, `approver`, or `super_admin` accounts.
- Default page size is 15; selectable sizes are exactly 15, 25, 50, and 100; pagination, search, and filtering are server-side.
- Do not hard-delete users or modify orders, wallet balances, withdrawal ledger state, or KYC evidence/audit records.
- Soft-delete must be blocked while the target has a `pending` or `processing` withdrawal.
- Mutating actions require a reason of at least 10 characters, a confirmation in the UI, and an audit log row.
- Clear Bio restriction resets `bio_violation_count` and `bio_cooldown_until`; account restoration returns the user to `email_verified` and resets verification progress.

---

### Task 1: Define User Management contracts and validation

**Files:**
- Create: `lib/user-management/types.ts`
- Create: `lib/validation/user-management-schemas.ts`
- Test: `lib/user-management/__tests__/pagination.test.ts`

**Interfaces:**
- `UserManagementAction = "clear_bio_restriction" | "suspend" | "unsuspend" | "soft_delete" | "restore"`.
- `UserManagementFilters` contains `page`, `pageSize`, `search`, `role`, `status`, `kycStatus`, and `bioLocked`.
- `parseUserManagementFilters(searchParams: URLSearchParams): UserManagementFilters` clamps page to 1+, accepts only page sizes 15/25/50/100, and ignores invalid enum filters.
- `userManagementActionSchema` requires `{ userId: uuid, action: UserManagementAction, reason: string.min(10) }`.

- [ ] **Step 1: Write the failing tests**

```ts
it("defaults to page 1 and 15 rows", () => {
  expect(parseUserManagementFilters(new URLSearchParams()).pageSize).toBe(15);
});
it("accepts explicit supported page sizes and clamps invalid pages", () => {
  const filters = parseUserManagementFilters(new URLSearchParams("page=0&pageSize=50"));
  expect(filters).toMatchObject({ page: 1, pageSize: 50 });
});
it("rejects unsupported page sizes", () => {
  expect(parseUserManagementFilters(new URLSearchParams("pageSize=20")).pageSize).toBe(15);
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- --run lib/user-management/__tests__/pagination.test.ts`
Expected: FAIL because the parser module does not exist.

- [ ] **Step 3: Implement the contracts and parser**

Use literal unions for actions/statuses and return normalized values; never pass raw query strings directly into SQL.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- --run lib/user-management/__tests__/pagination.test.ts`
Expected: PASS.

---

### Task 2: Add secure Supabase list/detail/mutation RPCs

**Files:**
- Create: `supabase/migrations/20260716000060_admin_user_management.sql`
- Test: `lib/user-management/__tests__/rpc-contract.test.ts`

**Interfaces:**
- `public.admin_list_users(p_search text, p_role text, p_status text, p_kyc_status text, p_bio_locked boolean, p_page integer, p_page_size integer) returns jsonb`.
- `public.admin_get_user(p_user_id uuid) returns jsonb`.
- `public.admin_manage_user(p_user_id uuid, p_action text, p_reason text) returns jsonb`.

The list RPC must check `is_super_admin(auth.uid())`, exclude privileged roles, use `LIMIT/OFFSET`, return `items`, `total`, `page`, `pageSize`, `totalPages`, and include only safe profile/status fields. The detail RPC must apply the same privileged-target guard and return profile, verification, Bio restriction, account status, roles, and pending withdrawal count; it must not return KYC files or wallet balances.

The mutation RPC must:

- reject unauthenticated/non-super-admin callers, self-targets, privileged targets, invalid actions, and reasons shorter than 10 characters;
- allow Bio reset, active→suspended, suspended→active, active→deleted, and deleted→active transitions only;
- block soft deletion when `withdrawal_requests.status IN ('pending','processing')`;
- preserve orders, wallet rows/ledger, KYC submissions/files/audit rows;
- for restore, set `status='active'`, clear `closed_at`, set tier from email verification, clear phone/profile/KYC verification state as the existing `restore_my_account` RPC does;
- write `audit_logs` with before/after JSON and reason;
- insert an in-app notification for every action;
- return `{ action, userId, email, name, status, ... }` for API email enqueueing.

- [ ] **Step 1: Write contract tests**

Test the migration text contains the three exact function signatures, `is_super_admin`, the pending/processing withdrawal guard, privileged-role exclusion, and audit/notification inserts. These are static contract tests because the repository’s remote Supabase database is not available in Vitest.

- [ ] **Step 2: Run tests and verify the contract test fails**

Run: `npm test -- --run lib/user-management/__tests__/rpc-contract.test.ts`
Expected: FAIL because the migration file does not exist.

- [ ] **Step 3: Write the migration**

Use `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp`, revoke execution from `PUBLIC`/`anon`, grant execution to `authenticated`, and keep every privileged check inside the RPC rather than relying on the UI.

- [ ] **Step 4: Run contract tests**

Run: `npm test -- --run lib/user-management/__tests__/rpc-contract.test.ts`
Expected: PASS.

- [ ] **Step 5: Apply the migration to the primary Supabase project**

Run the complete file in the project’s Supabase SQL Editor, then run `NOTIFY pgrst, 'reload schema';`. Do not apply it to the old worktree/test project.

---

### Task 3: Add API routes with server-side filtering and safe mutations

**Files:**
- Create: `app/api/admin/users/route.ts`
- Create: `app/api/admin/users/[userId]/route.ts`
- Modify: `lib/email/templates.ts`
- Modify: `lib/email/outbox.ts`
- Modify: `lib/email/sender.ts`
- Create: `supabase/migrations/20260716000070_account_management_email.sql`
- Test: `app/api/admin/users/__tests__/route-contract.test.ts`

**Interfaces:**
- `GET /api/admin/users` returns `{ data: { items, total, page, pageSize, totalPages } }`.
- `GET /api/admin/users/:userId` returns `{ data: userDetail }`.
- `POST /api/admin/users/:userId` accepts `{ action, reason }` and returns the RPC result.

Each route must authenticate, check `is_super_admin`, parse/validate inputs, and map known RPC errors to 400/403/404/409/422 without exposing raw database errors. The POST route queues account-status emails for suspend, unsuspend, soft delete, and restore using the existing outbox; Bio reset remains in-app notification only.

Extend the email union/template/outbox payload to support `account_suspended`, `account_unsuspended`, `account_deleted`, and `account_restored`, carrying recipient name, reason, and event time. Add the four event values to the outbox check constraint in the new migration. Keep existing transaction email rendering unchanged.

- [ ] **Step 1: Write route contract tests**

Cover supported page-size query parameters, action names, and that the email event mapping excludes `clear_bio_restriction`.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- --run app/api/admin/users/__tests__/route-contract.test.ts`
Expected: FAIL because routes and email mapping do not exist.

- [ ] **Step 3: Implement routes and email support**

Use `apiOk`/`apiFail`, the authenticated Supabase client for RPC calls, and `enqueueEmail` only after a successful mutation. Never accept actor IDs from the request body.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run app/api/admin/users/__tests__/route-contract.test.ts`
Expected: PASS.

---

### Task 4: Build the User Management page and navigation entry

**Files:**
- Create: `app/admin/users/page.tsx`
- Create: `components/admin/user-management-drawer.tsx`
- Modify: `app/admin/layout.tsx`

**Interfaces:**
- The page owns filters, pagination, selection, refresh, and drawer state.
- The drawer receives `userId`, `onClose`, and `onChanged` and loads detail through the API.

The navigation item must be inserted exactly between Catalogue Review and KYC Review. The page must render 15 rows by default, page-size options 15/25/50/100, page-number input, previous/next controls, search, role/status/KYC/Bio filters, loading/empty/error states, and a safe user table. The drawer must show the agreed fields and confirmation dialogs requiring a 10-character reason for mutations. Buttons must be hidden/disabled according to current status and action eligibility; no KYC image or wallet balance is shown.

- [ ] **Step 1: Implement the page shell and navigation**

Use existing admin colors, `Button`, `EmptyState`, `useAuth`, and `useActionFeedback`; do not change existing navigation behavior for other entries.

- [ ] **Step 2: Implement the detail drawer and actions**

On success, refresh the list/detail, show feedback, and preserve the current page. On API errors, display the server message.

- [ ] **Step 3: Run the app and manually verify**

Run: `npm run dev`
Log in as `super_admin`, open `/admin/users`, verify page size 15, enter a page number, search/filter, open a drawer, and test a Bio reset against the previously locked test account.

---

### Task 5: Full verification and handoff

**Files:**
- No additional files.

- [ ] **Step 1: Run all automated checks**

Run: `npm test`, `npx eslint app/admin/users app/api/admin/users components/admin/user-management-drawer.tsx lib/user-management lib/validation/user-management-schemas.ts`, and `git diff --check`.

- [ ] **Step 2: Run the production build**

Run: `npm run build` and confirm compilation, TypeScript, and route generation complete successfully.

- [ ] **Step 3: Verify the Supabase migration**

Confirm the migration has been run on the primary Supabase project and `NOTIFY pgrst, 'reload schema';` completed.

- [ ] **Step 4: Report exact changed files and manual test steps**

Do not commit or push unrelated existing worktree changes.
