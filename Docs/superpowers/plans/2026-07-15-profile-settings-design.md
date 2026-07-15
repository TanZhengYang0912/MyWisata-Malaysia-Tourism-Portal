# Verified User Profile Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the completed-profile placeholder with a sectioned personal Profile page, expose a safe public contributor profile, and provide soft-delete account closure with re-verification-based restoration.

**Architecture:** Keep the existing step wizard for incomplete users. Once the user reaches profile-complete or KYC-verified, fetch a dedicated authenticated profile summary and render independent Personal details, Contact, Verification, Preferences, and Danger Zone sections. Public profiles continue to use the `public_users` view/allow-list and never expose contact or KYC evidence. Account lifecycle mutations use server-side RPCs so clients cannot directly change `users.status`.

**Tech Stack:** Next.js App Router, React client components, Supabase SSR client, PostgreSQL migrations/RPCs, Vitest, TypeScript.

## Global Constraints

- Keep Email read-only in Profile; email changes must use Supabase Auth confirmation.
- Phone changes must invalidate the old phone verification and require SMS OTP again.
- Verification and KYC fields are read-only to users; rejected KYC displays only the configured reason and a resubmission action.
- Public profiles show only avatar, display name, city/country, bio, and Verified Contributor badge.
- Never expose Email, Phone, survey answers, KYC document paths, document numbers, or internal review notes publicly.
- Account closure is a soft delete; preserve orders, wallet, KYC, and audit data.
- Suspended users cannot self-restore; this feature does not change admin suspension policy.
- Do not modify unrelated catalogue, checkout, wallet, recommendation, or admin-review modules.

---

### Task 1: Define the profile-summary contract and authenticated read endpoint

**Files:**
- Create: `lib/profile/profile-summary.ts`
- Create: `lib/profile/__tests__/profile-summary.test.ts`
- Create: `app/api/profile/me/route.ts`
- Modify: `backend/core/types.ts`

**Interfaces:**
- `ProfileSummary` contains `id`, `email`, `fullName`, `displayName`, `avatarUrl`, `bio`, `phone`, `city`, `country`, `status`, `tier`, `kycStatus`, `emailVerified`, `phoneVerified`, `profileComplete`, `survey`, and `latestKycReview`.
- `GET /api/profile/me` returns `{ data: ProfileSummary }` for the authenticated user and `401` when unauthenticated.
- `latestKycReview` contains only `status`, `reasonCode`, `reasonDetail`, `reviewedAt`; no document paths or reviewer identity.

- [ ] **Step 1: Write mapper tests** for full row mapping, null-safe fields, masked phone display helper, and latest KYC reason selection.
- [ ] **Step 2: Run** `npm test -- lib/profile/__tests__/profile-summary.test.ts` and verify the new tests fail because the mapper does not exist.
- [ ] **Step 3: Implement** the typed mapper and route using the authenticated server Supabase client. Query only the current user, preferences, and their latest KYC submission.
- [ ] **Step 4: Run** the targeted test and `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat: add authenticated profile summary endpoint`.

### Task 2: Add soft-delete lifecycle RPCs and restore gating

**Files:**
- Create: `supabase/migrations/20260715000040_profile_account_lifecycle.sql`
- Create: `app/api/account/close/route.ts`
- Create: `app/api/account/restore/route.ts`
- Create: `app/account-restore/page.tsx`
- Create: `app/account-suspended/page.tsx`
- Modify: `backend/core/types.ts`
- Modify: `components/providers/auth.tsx`
- Create: `lib/account/__tests__/lifecycle.test.ts`

**Interfaces:**
- `close_my_account()` is a `SECURITY DEFINER` RPC that sets `users.status = 'deleted'`, records `closed_at`, and rejects already suspended/deleted users without deleting business data.
- `restore_my_account()` is a `SECURITY DEFINER` RPC that only restores a deleted user after the authenticated session is valid; it sets status to active and clears phone/profile/KYC verification timestamps/status so the user must re-verify.
- `POST /api/account/close` calls close RPC, signs out the current session, and returns success.
- `POST /api/account/restore` calls restore RPC and returns the next verification tier.
- `User.status` is `active | suspended | deleted`; AuthProvider routes deleted users to `/account-restore` and suspended users to `/account-suspended`.

- [ ] **Step 1: Write lifecycle tests** covering close, restore reset semantics, suspended-user rejection, and idempotent repeated calls.
- [ ] **Step 2: Run** the targeted tests and verify they fail before migration/route implementation.
- [ ] **Step 3: Add migration** with `closed_at`, RPC authorization (`auth.uid()` only), and grants to `authenticated`; do not add client-write policies for status.
- [ ] **Step 4: Implement close/restore routes** with session checks and safe error mapping.
- [ ] **Step 5: Update AuthProvider** to load `status` and redirect only deleted users to the restore page; keep admin and suspended-user behavior unchanged.
- [ ] **Step 6: Implement restore UI** explaining that Phone, Profile, and KYC verification must be completed again.
- [ ] **Step 7: Implement the suspended-account page** with no restore action and a Support link.
- [ ] **Step 8: Run** targeted tests, `npx tsc --noEmit`, and `npm run build`.
- [ ] **Step 9: Commit** `feat: add soft-delete account lifecycle`.

### Task 3: Build the sectioned completed Profile page

**Files:**
- Create: `components/profile/profile-section.tsx`
- Create: `components/profile/profile-summary-card.tsx`
- Create: `components/profile/profile-sections.tsx`
- Modify: `app/customer/profile/page.tsx`
- Create: `lib/profile/__tests__/profile-display.test.ts`

**Interfaces:**
- Incomplete users keep the existing five-step wizard unchanged.
- Completed users render independent sections with their own loading, edit, save, and error state.
- Personal details save through existing `/api/profile/identity`, `/api/profile/bio`, and avatar endpoints.
- Contact exposes read-only email and masked phone; phone changes reuse `/api/phone/send-otp` and `/api/phone/verify-otp`.
- Verification has no user-editable controls; rejected KYC links to `/customer/kyc`.
- Preferences reads/writes through existing survey endpoint and displays a concise summary.
- Danger Zone calls `/api/account/close` after a typed confirmation and signs the user out.

- [ ] **Step 1: Write display tests** for section visibility, masked phone, rejected-KYC reason rendering, and no-public-sensitive-fields rule.
- [ ] **Step 2: Run** targeted tests and verify failure.
- [ ] **Step 3: Implement** section components with independent `Edit/Save` controls and a single `GET /api/profile/me` refresh after successful mutations.
- [ ] **Step 4: Replace only the completed state** in `app/customer/profile/page.tsx`; preserve the current wizard branch and existing step validation.
- [ ] **Step 5: Add Danger Zone confirmation** requiring the user to type `DELETE` before calling close.
- [ ] **Step 6: Run** targeted tests and `npm run build`.
- [ ] **Step 7: Commit** `feat: add sectioned user profile settings`.

### Task 4: Complete the safe public contributor profile

**Files:**
- Modify: `backend/core/types.ts`
- Modify: `backend/domains/identity.ts`
- Modify: `app/customer/profile/[userId]/page.tsx`
- Create: `supabase/migrations/20260715000050_public_profile_bio.sql`
- Modify: `lib/profile/__tests__/profile-summary.test.ts`

**Interfaces:**
- Extend `PublicUser` with optional `bio` only.
- Extend the existing `public_users` allow-list query with `bio`; keep Email, Phone, survey, KYC evidence, and review details excluded.
- Render the public bio and existing badge/location only for active public users.

- [ ] **Step 1: Add a failing test** proving `bio` is mapped while a fixture containing email/phone is ignored.
- [ ] **Step 2: Run** the targeted test and verify failure.
- [ ] **Step 3: Update** the public select/mapping, view migration, and page layout.
- [ ] **Step 4: Run** targeted tests, `npx tsc --noEmit`, and `npm run build`.
- [ ] **Step 5: Commit** `feat: show safe bio on public contributor profiles`.

### Task 5: End-to-end verification and handoff

**Files:**
- Test only: existing Vitest suites and Playwright configuration

- [ ] **Step 1:** Run `npm test`.
- [ ] **Step 2:** Run `npx tsc --noEmit`.
- [ ] **Step 3:** Run `npm run build`.
- [ ] **Step 4:** Run `git diff --check`.
- [ ] **Step 5:** Manually verify: incomplete wizard remains unchanged; completed Profile sections load; phone change requires OTP; rejected KYC reason/resubmit works; public profile is reachable only from a recommendation; Delete closes and signs out; re-login shows restore; restore resets verification; suspended users cannot self-restore.
- [ ] **Step 6:** Apply the lifecycle migration to the primary Supabase project and run `NOTIFY pgrst, 'reload schema';`.
- [ ] **Step 7:** Report changed files and test results before any merge or push.
