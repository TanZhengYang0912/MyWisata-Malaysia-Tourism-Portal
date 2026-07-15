# Account-management reason moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with checkpoints.

**Goal:** Apply fail-closed Gemini moderation to Super Admin account-management reasons and suspended-user appeals, while preventing direct client bypass of the management mutation RPC.

**Architecture:** Add a reusable server-only account-text moderation wrapper beside the existing Bio moderation. Validate and moderate in the two Next.js API boundaries before side effects; execute the account mutation through the service-role client with an explicit actor ID after revoking the client RPC grant. Keep the existing database state transition, audit, notification, email-outbox, and support-ticket behavior intact after moderation passes.

**Tech Stack:** Next.js App Router, TypeScript, Supabase SSR/service-role clients, PostgreSQL migrations, Zod, Vitest, Gemini `generateContent` API.

## Global Constraints

- Four inputs are moderated: Super Admin `suspend`, `soft_delete`, and `unsuspend` reasons, plus suspended-user account-review appeal messages.
- All four inputs require at least 10 trimmed characters.
- Flagged or unavailable moderation must not mutate state, create a ticket, write audit/notification records, or enqueue email.
- No self-service Unsuspend permission is introduced.
- Ordinary Support tickets and KYC workflows are unchanged.
- Preserve all unrelated existing working-tree changes.

---

### Task 1: Extract reusable fail-closed account-text moderation

**Files:**
- Modify: `lib/moderation.ts`
- Create: `lib/moderation.test.ts`

**Interfaces:**
- Consumes: `ModerationResult` and existing Bio Gemini request behavior.
- Produces: `moderateAccountText(text: string, context: "suspend_reason" | "soft_delete_reason" | "unsuspend_reason" | "suspension_appeal"): Promise<ModerationResult>` and a configurable `GEMINI_MODEL` lookup.

- [ ] **Step 1: Write failing tests**

Mock `global.fetch` and assert the helper sends a context-specific prompt, returns `{ flagged: false }` for strict JSON `{"flagged":false}`, returns categories for flagged JSON, and returns `{ error: "api_unavailable" }` for missing key, non-2xx, timeout/rejected fetch, and malformed JSON. Assert the request URL uses `process.env.GEMINI_MODEL` when set and `gemini-3.1-flash-lite` otherwise.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run lib/moderation.test.ts`

Expected: FAIL because `moderateAccountText` is not exported.

- [ ] **Step 3: Implement the minimal helper**

Refactor the shared Gemini request into a private function that accepts a context label and text. Keep the existing Bio prompt semantics, add an account-context prompt for the four labels, use `process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite"`, keep the 8-second timeout, and map every transport/status/parse failure to `api_unavailable`.

- [ ] **Step 4: Run focused tests**

Run: `npx vitest run lib/moderation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the isolated moderation helper**

```powershell
git add lib/moderation.ts lib/moderation.test.ts
git commit -m "feat: add fail-closed account text moderation"
```

### Task 2: Add moderation to Super Admin user-management mutations

**Files:**
- Modify: `app/api/admin/users/[userId]/route.ts`
- Create: `supabase/migrations/20260716000080_account_moderation_rpc.sql`
- Create: `app/api/admin/users/[userId]/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `moderateAccountText`, `createServiceClient`, existing `admin_manage_user` result and email enqueue helpers.
- Produces: `POST /api/admin/users/:userId` that moderates `suspend`, `soft_delete`, and `unsuspend` before mutation; a server-only RPC signature `admin_manage_user(p_actor_id uuid, p_user_id uuid, p_action text, p_reason text)`.

- [ ] **Step 1: Write route-contract tests first**

Mock `createClient`, `createServiceClient`, `moderateAccountText`, and `enqueueUserAccountEmail`. Cover: short reason returns 422 without Gemini; flagged reason returns 422 without service RPC/email; unavailable Gemini returns 503 without service RPC/email; clean suspend calls service RPC with `p_actor_id`, target, action, and reason and then enqueues the existing email; `clear_bio_restriction` and `restore` preserve the existing non-moderated path.

- [ ] **Step 2: Run the focused route tests and verify they fail**

Run: `npx vitest run app/api/admin/users/[userId]/__tests__/route.test.ts`

Expected: FAIL because the route still calls the cookie client RPC and has no moderation branch.

- [ ] **Step 3: Implement API moderation and server-only mutation**

After `userManagementActionSchema` parsing, call `moderateAccountText` only for `suspend`, `soft_delete`, and `unsuspend`. Map flagged to `apiFail("CONTENT_REJECTED", "This reason contains disallowed content", 422)` and unavailable to `apiFail("MODERATION_UNAVAILABLE", "Content review is temporarily unavailable; please try again", 503)`. Use `createServiceClient().rpc("admin_manage_user", { p_actor_id: user.id, ... })` for the mutation and keep the existing email enqueue only after a successful RPC.

- [ ] **Step 4: Harden the database function and grants**

Create a follow-up migration rather than editing an already-applied migration. Drop the old three-argument function, create the four-argument function with `p_actor_id`, replace every `auth.uid()` actor comparison/audit value with `p_actor_id`, retain `is_super_admin(p_actor_id)`, target protection, state validation, minimum-length check, audit, notification, and returned user data. Revoke execute from `PUBLIC`, `anon`, and `authenticated`; grant execute only to `service_role`.

- [ ] **Step 5: Run route tests and SQL shape checks**

Run: `npx vitest run app/api/admin/users/[userId]/__tests__/route.test.ts`

Expected: PASS. Then run `rg -n "admin_manage_user|GRANT EXECUTE|REVOKE ALL" supabase/migrations` and verify no authenticated grant remains for the four-argument mutation.

- [ ] **Step 6: Commit the admin boundary change**

```powershell
git add app/api/admin/users/[userId]/route.ts app/api/admin/users/[userId]/__tests__/route.test.ts supabase/migrations/20260716000080_account_moderation_rpc.sql
git commit -m "feat: moderate admin account-management reasons"
```

### Task 3: Moderate suspended-user appeals without changing ordinary support tickets

**Files:**
- Modify: `app/account-suspended/page.tsx`
- Create: `app/api/account-suspended/appeal/route.ts`
- Create: `app/api/account-suspended/appeal/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `supportTicketSchema`, `classifyTicketSmart`, `createClient`, `moderateAccountText`.
- Produces: authenticated `POST /api/account-suspended/appeal` accepting `{ body: string }`, creating the same `Account suspension appeal` support ticket only after moderation.

- [ ] **Step 1: Write failing tests**

Mock the cookie client, moderation helper, and classification helper. Assert short body returns 422; flagged body returns 422 without insert; unavailable moderation returns 503 without insert; clean body inserts the fixed subject with the authenticated user ID and returns 201 with ticket ID.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `npx vitest run app/api/account-suspended/appeal/__tests__/route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the dedicated appeal route**

Require `supabase.auth.getUser()` and reject unauthenticated callers with 401. Validate a trimmed body of 10–2000 characters. Call `moderateAccountText(body, "suspension_appeal")`; map outcomes to the same 422/503 responses as Task 2. On clean text, classify with the existing `classifyTicketSmart("Account suspension appeal", body)` and insert into `support_tickets` with `user_id`, fixed subject, category, classification method, and `status: "open"`.

- [ ] **Step 4: Point the suspended page to the dedicated route**

Change only the appeal form fetch URL from `/api/support/tickets` to `/api/account-suspended/appeal`; keep the current minimum-length button state, ticket confirmation, and support-ticket link UI.

- [ ] **Step 5: Run focused appeal tests**

Run: `npx vitest run app/api/account-suspended/appeal/__tests__/route.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the appeal boundary change**

```powershell
git add app/account-suspended/page.tsx app/api/account-suspended/appeal/route.ts app/api/account-suspended/appeal/__tests__/route.test.ts
git commit -m "feat: moderate account suspension appeals"
```

### Task 4: Full verification and remote migration handoff

**Files:**
- Verify: all files changed in Tasks 1–3
- Verify: `supabase/migrations/20260716000080_account_moderation_rpc.sql`

- [ ] **Step 1: Run the complete automated checks**

Run: `npm test`

Expected: all existing tests pass with no new failures.

- [ ] **Step 2: Run production build and targeted lint**

Run: `npm run build` and `npx eslint lib/moderation.ts app/api/admin/users/[userId]/route.ts app/api/account-suspended/appeal/route.ts app/account-suspended/page.tsx`

Expected: build exits 0; targeted lint has no errors.

- [ ] **Step 3: Check patch hygiene**

Run: `git diff --check`

Expected: exit 0.

- [ ] **Step 4: Verify remote SQL requirements without applying them**

Confirm the user knows to run the new migration in the primary Supabase project, then execute `NOTIFY pgrst, 'reload schema';`. Do not run it against the old worktree/test project and do not claim deployment until the user reports successful execution.

- [ ] **Step 5: Commit verification-only changes if any**

```powershell
git status --short
```

Do not stage or commit unrelated pre-existing modifications.
