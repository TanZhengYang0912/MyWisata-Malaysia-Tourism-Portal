# KYC Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make KYC evidence immutable and dual-sided, move tier gates into authoritative database RPCs, and give applicants and reviewers a secure, auditable workflow.

**Architecture:** Migration `033_kyc_security_hardening.sql` becomes the sole source of truth for withdrawal/recommendation gates, dual-file KYC lifecycle, structured review reasons, and storage access. Next API routes authenticate the caller, orchestrate service-role uploads and signed viewing, while the database performs state transitions under the caller identity. React pages consume DTOs from route handlers rather than querying KYC storage directly.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase Postgres/RLS/Storage, Vitest, Node integration scripts.

## Global Constraints

- New KYC submissions require separate `front` and `back` files for every allowed document type.
- Only `tier = 'kyc_verified'`, `kyc_status = 'approved'`, an existing Stripe Connect account, and `stripe_payouts_enabled = true` may withdraw.
- `submit_recommendation` itself must require `profile_complete`; API checks are not security boundaries.
- KYC evidence is private, random-path, immutable, and never appears in audit rows, URLs, notifications, or public views.
- New IC fingerprints use server-only `KYC_IC_HMAC_KEY` and `hmac_sha256_v1`; old SHA-256 values remain legacy audit data.
- Reject uses the approved reason catalog; `other` requires a detail of at least 10 characters.
- Rejected/superseded objects are removed after 90 days; approved objects are removed 90 days after account closure or replacement approval.
- All implementation changes follow red → green → refactor; do not write production code before its failing test.

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/033_kyc_security_hardening.sql` | Schema, legacy migration, RPC guards, RLS, retention function, audit RPCs. |
| `lib/kyc/hash.ts` | Normalisation and versioned server-side HMAC fingerprint. |
| `lib/kyc/types.ts` | Shared KYC reason, side, and submission DTO types. |
| `app/api/kyc/upload/route.ts` | Begin → service upload two files → finalise flow and orphan cleanup. |
| `app/api/admin/kyc/documents/[submissionId]/[side]/route.ts` | Admin-only 5-minute signed document view plus view audit. |
| `app/api/admin/kyc/review/route.ts` | Structured review reason validation and RPC call. |
| `app/customer/kyc/page.tsx` | Two file controls and latest rejected/info-requested state. |
| `app/admin/kyc/page.tsx` | Front/back view actions and reason-code selector with conditional detail input. |
| `components/shared/verified-contributor-badge.tsx` | Boolean-only public badge. |
| `types/database.ts`, `backend/core/types.ts`, `backend/domains/identity.ts` | Remove single-document assumptions and expose safe KYC DTOs. |
| `tests/integration/kyc-security.spec.ts`, `scripts/run-kyc-security-integration.mjs` | Direct-RPC/RLS integration regression suite. |
| `lib/kyc/__tests__/hash.test.ts`, `lib/kyc/__tests__/review-reasons.test.ts` | Fast unit coverage for pure security contracts. |

### Task 1: Establish pure KYC contracts and test harness

**Files:**
- Create: `lib/kyc/types.ts`
- Create: `lib/kyc/review-reasons.ts`
- Create: `lib/kyc/__tests__/review-reasons.test.ts`
- Create: `lib/kyc/__tests__/hash.test.ts`
- Modify: `lib/kyc/hash.ts`

**Consumes:** the agreed reason catalog and `KYC_IC_HMAC_KEY` environment secret.

**Produces:** `KycDocumentSide`, `KycReviewReasonCode`, `validateReviewReason()`, and `hashICWithHmac()` for all routes.

- [ ] **Step 1: Write failing unit tests for reason and HMAC contracts.**

```ts
expect(validateReviewReason('reject', 'other', 'too short')).toEqual({ ok: false, error: 'reason_detail_too_short' });
expect(validateReviewReason('request_info', 'document_suspected_tampering', null)).toEqual({ ok: false, error: 'reason_code_not_allowed' });
await expect(hashICWithHmac('900101-14-5678', 'test-secret')).resolves.toEqual({ algorithm: 'hmac_sha256_v1', value: expect.stringMatching(/^[a-f0-9]{64}$/) });
```

- [ ] **Step 2: Run `npx vitest run lib/kyc/__tests__/review-reasons.test.ts lib/kyc/__tests__/hash.test.ts`; verify it fails because the modules/functions do not exist.**

- [ ] **Step 3: Implement the minimal contracts.**

```ts
export const KYC_REVIEW_REASON_CODES = ['document_unreadable', 'document_incomplete', 'document_mismatch', 'document_expired', 'document_suspected_tampering', 'other'] as const;
export async function hashICWithHmac(ic: string, secret = process.env.KYC_IC_HMAC_KEY): Promise<{ algorithm: 'hmac_sha256_v1'; value: string }> { /* WebCrypto HMAC SHA-256; throw if secret absent */ }
```

- [ ] **Step 4: Re-run the two test files; verify they pass.**
- [ ] **Step 5: Commit `test: define KYC security contracts`.**

### Task 2: Add authoritative SQL schema, lifecycle, and direct-RPC gates

**Files:**
- Create: `supabase/migrations/033_kyc_security_hardening.sql`
- Create: `tests/integration/kyc-security.spec.ts`
- Create: `scripts/run-kyc-security-integration.mjs`

**Consumes:** Task 1 reason code names; existing `tier_rank`, `is_admin`, audit table, wallet schema, and `kyc_submissions`.

**Produces:** dual-evidence schema; `begin_kyc_submission`, `finalize_kyc_submission`, hardened `debit_withdrawal`, hardened `submit_recommendation`, hardened `admin_review_kyc`, `get_kyc_document_view`, and retention RPCs.

- [ ] **Step 1: Write failing direct-database tests.** Use two authenticated test clients and a service client created from `KYC_TEST_SUPABASE_URL`, `KYC_TEST_SUPABASE_ANON_KEY`, and `KYC_TEST_SUPABASE_SERVICE_ROLE_KEY`; skip only when `RUN_KYC_DB_INTEGRATION !== '1'`.

```ts
await expect(unverified.rpc('debit_withdrawal', { p_user_id: unverifiedId, p_amount_rm: 10 })).resolves.toMatchObject({ error: expect.objectContaining({ message: expect.stringContaining('kyc_required') }) });
await expect(emailOnly.rpc('submit_recommendation', validRecommendation)).resolves.toMatchObject({ error: expect.objectContaining({ message: expect.stringContaining('tier_insufficient') }) });
```

- [ ] **Step 2: Run `RUN_KYC_DB_INTEGRATION=1 npx vitest run tests/integration/kyc-security.spec.ts`; verify the two assertions fail on the current migration.**

- [ ] **Step 3: Implement migration 033.** It must:

```sql
CREATE TYPE kyc_document_side AS ENUM ('front', 'back');
CREATE TABLE kyc_submission_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), submission_id uuid NOT NULL REFERENCES kyc_submissions(id) ON DELETE RESTRICT,
  side kyc_document_side NOT NULL, storage_path text NOT NULL UNIQUE, mime_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (submission_id, side)
);
```

Add `superseded` to KYC status, `review_reason_code`, `review_reason_detail`, `ic_hash_version`, and `legacy_single_document`. Rewrite `debit_withdrawal` to lock the user row and raise `kyc_required` unless all four global withdrawal conditions hold. Rewrite `submit_recommendation` to reject tiers below `profile_complete` immediately after reading `auth.uid()`.

- [ ] **Step 4: Add begin/finalise and review state rules.** `begin_kyc_submission` creates an authenticated caller-owned `draft` UUID; `finalize_kyc_submission` only accepts paths with prefix `<auth.uid()>/<draft-id>/`, verifies both side rows and storage objects exist, then moves to `pending`. `admin_review_kyc` validates reason code/detail, transitions `info_requested` or `rejected` records correctly, and marks an older active record `superseded` before a new draft starts.

- [ ] **Step 5: Replace Storage policies.** Remove authenticated user SELECT/UPDATE/DELETE policies on `kyc-documents`; service role performs upload/delete. Permit no client object mutation. Keep the bucket private. Make `get_kyc_document_view` require `is_admin(auth.uid())`, insert a path-free `kyc.document_viewed` audit entry, and return only a validated storage path to the server route.

- [ ] **Step 6: Add legacy and retention migration statements.** Mark historic approved/rejected rows `legacy_single_document`; convert active legacy rows to `info_requested` with `document_incomplete`; add a privileged `purge_expired_kyc_evidence()` that deletes eligible storage objects and logs only submission ID and side.

- [ ] **Step 7: Apply migration to the disposable integration database, re-run the test, and verify both direct calls now fail with the expected domain errors.**
- [ ] **Step 8: Commit `feat: enforce KYC gates and immutable evidence schema`.**

### Task 3: Implement two-file server submission and secure document viewing

**Files:**
- Modify: `app/api/kyc/upload/route.ts`
- Create: `app/api/admin/kyc/documents/[submissionId]/[side]/route.ts`
- Modify: `lib/supabase/service.ts`
- Modify: `lib/kyc/magic-bytes.ts`
- Modify: `types/database.ts`
- Test: `tests/integration/kyc-security.spec.ts`

**Consumes:** Task 1 HMAC contract and Task 2 draft/finalise RPCs.

**Produces:** authenticated submission endpoint accepting both sides and admin-only signed document route.

- [ ] **Step 1: Extend the integration test with a two-file lifecycle.** Assert that a finalisation with one side fails, two distinct service-uploaded objects finalise to pending, and a direct authenticated Storage overwrite is denied.

```ts
expect((await applicant.storage.from('kyc-documents').update(path, bytes)).error).toBeTruthy();
expect((await applicant.rpc('finalize_kyc_submission', { p_submission_id: id, p_front_path: front, p_back_path: back })).error).toBeNull();
```

- [ ] **Step 2: Run the integration test and verify its lifecycle assertions fail before route/migration support exists.**

- [ ] **Step 3: Replace the single `file` contract with `frontFile` and `backFile`.** Validate both values exist, each has allowed MIME, max 5MB, and matching magic bytes. Call `begin_kyc_submission`, upload through `createServiceClient()` to `<user-id>/<submission-id>/<side>.<ext>`, call `finalize_kyc_submission` as the authenticated user, and on failure use the service client to delete any uploaded paths plus abandon the draft.

- [ ] **Step 4: Replace browser-side signing with a route.** The new GET route validates UUID and side, calls `get_kyc_document_view` as the signed-in admin, uses the service client to create a 300-second signed URL, and returns `{ data: { signedUrl, expiresIn: 300 } }`. It must return 401/403/404 without revealing a path.

- [ ] **Step 5: Update database types.** Add `KycSubmissionDocumentRow`, `draft|superseded` statuses, reason fields, hash version, and legacy flag; remove consumer reliance on `document_url` for new rows.

- [ ] **Step 6: Re-run the integration test and focused unit tests; verify all pass.**
- [ ] **Step 7: Commit `feat: submit and view immutable dual-sided KYC evidence`.**

### Task 4: Replace customer KYC submission UI and expose final decisions

**Files:**
- Modify: `app/customer/kyc/page.tsx`
- Modify: `backend/core/types.ts`
- Modify: `backend/domains/identity.ts`
- Test: `tests/e2e/kyc-submission.spec.ts`

**Consumes:** Task 3 `frontFile`/`backFile` endpoint response and Task 2 status/reason columns.

**Produces:** accessible dual-upload form and latest-state status card for pending, information requested, rejected, approved, and ready states.

- [ ] **Step 1: Write a failing Playwright scenario.** Sign in as a profile-complete test user, select only the front file, assert submission remains disabled; select both, assert FormData contains `frontFile` and `backFile`; seed a rejected row and assert its standard reason and detail are visible with a new-submission action.

- [ ] **Step 2: Run `npx playwright test tests/e2e/kyc-submission.spec.ts`; verify it fails because the form has one upload and rejected state is excluded.**

- [ ] **Step 3: Replace `docFile`/`fileInputRef` with independent front/back state and inputs.** The submit button is disabled until both pass local validation; send `frontFile` and `backFile`; clear both only on a successful response.

- [ ] **Step 4: Query the latest submission regardless of final status.** Render immutable status data from `id,status,reviewed_at,review_reason_code,review_reason_detail`; map reason code to user-safe text; show a resubmit CTA for rejected and info-requested records but never allow document replacement.

- [ ] **Step 5: Update `KycSubmission` and identity query projections to expose `documents: Array<{ side; storagePath? }>` only to admin DTOs, while customer DTOs contain no path. Remove `getKycDocumentSignedUrl` from browser-consumed identity helpers.**

- [ ] **Step 6: Re-run the Playwright scenario and focused Vitest tests; verify they pass.**
- [ ] **Step 7: Commit `feat: require two immutable KYC document sides`.**

### Task 5: Implement structured administrator review and audited viewing

**Files:**
- Modify: `app/admin/kyc/page.tsx`
- Modify: `app/api/admin/kyc/review/route.ts`
- Modify: `lib/validation/schemas.ts`
- Test: `lib/kyc/__tests__/review-reasons.test.ts`
- Test: `tests/integration/kyc-security.spec.ts`

**Consumes:** Task 1 reason validation and Task 3 signed document route.

**Produces:** reason-code review requests and front/back view buttons.

- [ ] **Step 1: Add failing validation tests.** Assert reject accepts each catalog code, rejects unknown codes, rejects `other` under 10 characters, and rejects `document_suspected_tampering` for `request_info`.
- [ ] **Step 2: Run the focused test; verify it fails against the string-only reason API.**
- [ ] **Step 3: Change review payload to `{ userId, action, reasonCode?, reasonDetail? }`.** Validate action-specific reason policy in Zod and forward `p_reason_code` and `p_reason_detail` to the RPC. Notifications use standard reason copy plus optional detail, not internal paths or hashes.
- [ ] **Step 4: Change the admin page.** Replace free-text-only action forms with a select containing the six codes; show required textarea only for `other`; show two view buttons that call `/api/admin/kyc/documents/${submissionId}/front` and `/back` and open only the returned temporary URL.
- [ ] **Step 5: Extend integration coverage.** Verify a non-admin gets 403 from the view route/RPC, an admin view creates one path-free audit event, and review reason restrictions are enforced at SQL level.
- [ ] **Step 6: Re-run focused and integration tests; verify they pass.**
- [ ] **Step 7: Commit `feat: add structured and audited KYC review`.**

### Task 6: Add public verified-contributor badge without exposing KYC details

**Files:**
- Create: `components/shared/verified-contributor-badge.tsx`
- Modify: `types/database.ts`
- Modify: public recommendation author and public activity/comment contributor components identified by `rg -n "recommender|author|contributor" app components`
- Test: `components/shared/__tests__/verified-contributor-badge.test.tsx`

**Consumes:** `public_users.is_kyc_verified` and active-user filtering from the view.

**Produces:** a reusable boolean-only badge rendered on agreed public surfaces.

- [ ] **Step 1: Write a failing component test.**

```tsx
render(<VerifiedContributorBadge verified />);
expect(screen.getByText('Verified Contributor')).toBeVisible();
render(<VerifiedContributorBadge verified={false} />);
expect(screen.queryByText('Verified Contributor')).toBeNull();
```

- [ ] **Step 2: Run `npx vitest run components/shared/__tests__/verified-contributor-badge.test.tsx`; verify it fails because the component does not exist.**
- [ ] **Step 3: Implement a presentational component taking only `verified: boolean`; return `null` when false and a labelled badge when true.**
- [ ] **Step 4: Change public DTO queries to select only `public_users.is_kyc_verified`, then render the component on recommendation author, public contributor, and public profile cards. Do not query `users.tier`, `kyc_status`, or KYC timestamps.**
- [ ] **Step 5: Re-run component tests and the existing suite; verify they pass.**
- [ ] **Step 6: Commit `feat: show public verified contributor badge`.**

### Task 7: Add retention execution and full verification

**Files:**
- Modify: `app/api/cron/clear-earnings/route.ts` or create `app/api/cron/purge-kyc-evidence/route.ts`
- Modify: `scripts/run-kyc-security-integration.mjs`
- Modify: `README.md`
- Test: `tests/integration/kyc-security.spec.ts`

**Consumes:** Task 2 `purge_expired_kyc_evidence()` and all previous tests.

**Produces:** authenticated scheduled cleanup endpoint, documented secrets and final evidence.

- [ ] **Step 1: Add a failing retention test.** Seed a 91-day-old rejected/superseded evidence row and assert cleanup removes the private object, preserves the submission metadata, and emits an audit action with submission ID and side only.
- [ ] **Step 2: Run the integration test; verify it fails before the cleanup route is wired.**
- [ ] **Step 3: Implement a cron route requiring the existing cron secret, invoking the privileged purge RPC, and returning only aggregate counts. Add `KYC_IC_HMAC_KEY`, `RUN_KYC_DB_INTEGRATION`, and test Supabase variable names to README without values.**
- [ ] **Step 4: Run `npm run lint`, `npm test`, `npx playwright test tests/e2e/kyc-submission.spec.ts`, and `RUN_KYC_DB_INTEGRATION=1 npx vitest run tests/integration/kyc-security.spec.ts`; inspect every result before reporting completion.**
- [ ] **Step 5: Commit `test: verify KYC security boundaries and retention`.**

## Plan self-review

- **Spec coverage:** Tasks 1–5 cover HMAC, dual evidence, immutability, reasons, applicant display, admin signed viewing, and direct gates. Task 6 covers the public badge. Task 7 covers retention, documentation, and all required test evidence.
- **Completeness scan:** The plan contains no deferred implementation markers. Each task names exact files, test commands, expected red condition, interfaces, and green verification.
- **Type consistency:** `front`/`back`, reason codes, `hmac_sha256_v1`, `reasonCode`/`reasonDetail`, and the begin/finalise lifecycle are used consistently across migration, route, UI, and tests.
