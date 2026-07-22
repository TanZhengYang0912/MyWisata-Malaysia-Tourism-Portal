# Email OTP, Google Auth, and Verified Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure Email/Password registration with Email OTP, Google sign-in, a real `email_unverified` tier, and server-enforced verified-profile gates without changing unrelated modules.

**Architecture:** Supabase Auth remains the identity authority. A migration syncs confirmed Auth emails into `public.users`, adds `email_unverified` as the only new user starting state, and preserves existing accounts. The Next.js app provides registration, OTP, password reset, and Google OAuth callback UI; API/RPC gates use server-side tier and verified-timestamp checks. Profile photos are verified by magic bytes before confirmation.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Auth/SSR/PostgreSQL/RLS/Storage, Twilio Verify, Zod, Vitest.

## Global Constraints

- New Email/Password users start at `email_unverified`; they receive no application session until Supabase Email OTP confirmation succeeds.
- Google OAuth uses Supabase's Google provider and only `openid`, `email`, and `profile`; Google users begin at `email_verified`.
- Password policy is configured in Supabase Auth: minimum 10 characters; at least one uppercase letter, lowercase letter, and digit; symbols optional; leaked-password protection enabled if the project plan supports it.
- Google OAuth is `External + Testing`; at most 100 explicitly added Google Test Users may sign in for this FYP phase.
- Existing demo users and users already at `phone_verified`, `profile_complete`, or `kyc_verified` keep their current tier and gain `email_verified_at` during migration.
- A changed email must be confirmed by Supabase before it replaces `public.users.email`; a changed phone clears `phone_verified_at` and blocks checkout/booking until Twilio verifies the new number.
- Never trust browser state for verification, tier promotion, affiliate access, checkout/booking, withdrawal, or public badge status.
- Do not change unrelated Vendor, Chat, Admin AI, or order fulfilment modules. Preserve the pre-existing `app/api/admin/kyc/submissions/route.ts` edit untouched.

---

## File structure

- `supabase/migrations/049_auth_verification_tier.sql` — authoritative email verification state, tier migration, Auth trigger sync, gate helpers, RLS-safe promotion revisions, existing-user backfill.
- `lib/auth/password-policy.ts` — shared UI validation matching the Supabase Auth setting.
- `lib/auth/safe-next.ts` — only accepts local `next` redirects.
- `app/auth/callback/route.ts` — exchanges Supabase PKCE code and redirects safely.
- `app/login/page.tsx` — Sign in / Create account UI, OTP state, Google OAuth, reset-password request, retained demo buttons.
- `app/reset-password/page.tsx` — authenticated password reset completion using the same policy.
- `app/api/profile/avatar/confirm/route.ts` — verifies uploaded avatar bytes and size before writing `avatar_url`.
- `app/api/profile/identity/route.ts` and profile RPC migration — country is explicitly required before profile promotion.
- `app/api/affiliate/link/route.ts`, affiliate clearing/RPC migration — profile-complete limited link and KYC full earnings semantics.
- `app/api/stripe/create-checkout/route.ts`, `app/api/stripe/create-order-checkout/route.ts`, `app/customer/checkout/page.tsx`, and the `orders_insert_own` / `bookings_insert_own` policies — verify `phone_verified_at` at API and RLS boundaries.
- `app/customer/profile/[userId]/page.tsx` and `app/customer/recommendations/page.tsx` — display the existing badge only when the authoritative public view reports KYC verification.
- Focused tests beside each unit/route and migration contract tests under `tests/` or existing `__tests__` folders.

### Task 1: Supabase dashboard and Google preflight

**Files:**
- No repository file changes.
- Reference: `.env.local` only for the existing local app URL; do not commit credentials.

**Produces:** A hosted Supabase project configured to send Email OTP and accept Google Test Users.

- [ ] **Step 1: Configure Email Auth in Supabase Dashboard**

Set **Authentication → Providers → Email** to enable Email + Password and Confirm Email. Configure custom SMTP with the existing Gmail SMTP host, port 587, Gmail address, and App Password. In the Email confirmation template, render the Supabase token as a 6-digit code and set OTP expiry to 10 minutes.

- [ ] **Step 2: Configure password and anti-abuse settings**

Set Auth password minimum length to `10`, required characters to uppercase + lowercase + digits, and enable leaked-password protection when available. Set email send/verification rate limits to a maximum of five sends per hour and configure the app UI resend cooldown to 60 seconds.

- [ ] **Step 3: Configure Google OAuth for the FYP test cohort**

In Google Cloud, create an External OAuth client, leave publishing status as Testing, and add the intended Gmail testers. Add Supabase's callback URL:

```text
https://<supabase-project-ref>.supabase.co/auth/v1/callback
```

In Supabase **Authentication → Providers → Google**, enable Google and paste the Client ID/Secret. In **URL Configuration**, allow:

```text
http://localhost:3000/auth/callback
```

- [ ] **Step 4: Verify configuration manually**

Create a throwaway real Gmail test account through the Supabase Auth UI. Confirm that the 6-digit OTP arrives and that a Google Test User reaches the configured callback instead of an OAuth redirect error.

### Task 2: Add the unverified-email database state and trusted Auth sync

**Files:**
- Create: `supabase/migrations/049_auth_verification_tier.sql`
- Modify: `lib/constants.ts`
- Modify: `backend/core/types.ts`
- Test: `tests/auth-verification-tier.sql` (SQL assertions executed against the configured test project)

**Consumes:** Supabase `auth.users.email`, `auth.users.email_confirmed_at`, existing `public.users`, `tier_rank`, and `handle_new_auth_user` trigger.

**Produces:** `email_unverified` support, email-confirmation state synchronized only from Auth, and no downgrade for existing verified users.

- [ ] **Step 1: Write the failing migration assertions**

```sql
-- New password user has no confirmed email and no access tier.
select public.tier_rank('email_unverified') = 0 as starts_unverified;

-- Existing high-tier users remain high-tier after the migration.
select tier in ('phone_verified', 'profile_complete', 'kyc_verified') as preserved;
```

- [ ] **Step 2: Run the assertions before the migration**

Run the SQL against the test project. Expected: `tier_rank('email_unverified')` is missing or returns an invalid rank.

- [ ] **Step 3: Implement the migration**

The migration must:

```sql
-- Expand the CHECK constraint and set the default only for new rows.
-- Backfill email_verified_at for existing users at email_verified or above.
-- Replace tier_rank so email_unverified ranks 0.
-- Replace handle_new_auth_user so a new row copies auth.users.email,
-- assigns customer role, creates a wallet, and chooses email_unverified unless
-- NEW.email_confirmed_at is already present (Google).
-- Add an AFTER INSERT OR UPDATE trigger on auth.users that updates public.users.email,
-- email_verified_at, and promotes only email_unverified -> email_verified.
-- Keep phone/profile/KYC tiers intact during Auth email confirmation updates.
```

- [ ] **Step 4: Update TypeScript tier constants**

```ts
export const TIER_ORDER = [
  'email_unverified',
  'email_verified',
  'phone_verified',
  'profile_complete',
  'kyc_verified',
] as const;
```

Change default/fallback tier values in client and server auth readers from `email_verified` to `email_unverified`.

- [ ] **Step 5: Re-run migration assertions and focused TypeScript tests**

Run the SQL assertions, then:

```powershell
npm test -- lib/auth backend/core
npx tsc --noEmit
```

Expected: the new state ranks below email verification and no existing tier is demoted.

### Task 3: Build Email/Password registration, Email OTP, password reset, and Google OAuth UI

**Files:**
- Create: `lib/auth/password-policy.ts`
- Create: `lib/auth/safe-next.ts`
- Create: `app/auth/callback/route.ts`
- Create: `app/reset-password/page.tsx`
- Modify: `app/login/page.tsx`
- Test: `lib/auth/__tests__/password-policy.test.ts`
- Test: `lib/auth/__tests__/safe-next.test.ts`
- Test: `app/auth/__tests__/callback.test.ts`

**Consumes:** `createClient()` browser/server clients, Supabase `signUp`, `verifyOtp`, `signInWithPassword`, `signInWithOAuth`, `resetPasswordForEmail`, and `updateUser`.

**Produces:** A single login page with Sign in/Create account tabs, OTP step, Google button, safe callback, and reset-password flow.

- [ ] **Step 1: Write failing pure-unit tests**

```ts
expect(validatePassword('Abcdefghi1')).toEqual({ ok: true });
expect(validatePassword('abcdefghi1')).toMatchObject({ ok: false });
expect(safeNext('/customer/profile')).toBe('/customer/profile');
expect(safeNext('https://attacker.example')).toBe('/customer/explore');
```

- [ ] **Step 2: Run the focused tests**

```powershell
npm test -- lib/auth/__tests__/password-policy.test.ts lib/auth/__tests__/safe-next.test.ts
```

Expected: FAIL because helpers are absent.

- [ ] **Step 3: Implement the helpers**

`validatePassword` returns errors for fewer than 10 characters or missing uppercase/lowercase/digit. `safeNext` accepts only an absolute local path beginning with one `/` and falls back to `/customer/explore` for every other value.

- [ ] **Step 4: Implement the login states**

`app/login/page.tsx` must retain the demo buttons while adding:

```text
Sign in: Email, Password, Sign in, Forgot password, Continue with Google
Create account: Email, Password, Confirm password, Create account, Continue with Google
Verify email: six OTP inputs, verify, resend after 60 seconds
```

Use `supabase.auth.signUp({ email, password, options: { emailRedirectTo } })`, `verifyOtp({ email, token, type: 'signup' })`, `signInWithPassword`, and `signInWithOAuth({ provider: 'google', options: { redirectTo } })`. Never reveal whether an email exists. Use one generic response for registration, reset, and failed sign-in.

- [ ] **Step 5: Implement callback and reset password pages**

In `app/auth/callback/route.ts`, exchange the `code` with the server Supabase client and redirect through `safeNext`. `app/reset-password/page.tsx` validates the same password policy before `supabase.auth.updateUser({ password })`.

- [ ] **Step 6: Run focused tests**

```powershell
npm test -- lib/auth app/auth
```

Expected: PASS.

### Task 4: Make profile completion and avatar validation authoritative

**Files:**
- Modify: `supabase/migrations/049_auth_verification_tier.sql`
- Modify: `app/api/profile/avatar/route.ts`
- Modify: `app/api/profile/avatar/confirm/route.ts`
- Modify: `app/api/profile/identity/route.ts`
- Modify: `app/customer/profile/page.tsx`
- Create: `lib/profile/avatar-validation.ts`
- Test: `lib/profile/__tests__/avatar-validation.test.ts`
- Test: `app/api/profile/avatar/__tests__/confirm.test.ts`

**Consumes:** Existing KYC magic-byte signatures, avatars Storage bucket, `promote_to_profile_complete`, profile/survey APIs.

**Produces:** Explicit country confirmation and server-side JPEG/PNG/WebP validation (maximum 2 MB) before an avatar can satisfy the profile gate.

- [ ] **Step 1: Write failing image-validation tests**

```ts
expect(validateAvatarBytes(jpegBytes, 'image/jpeg')).toMatchObject({ ok: true });
expect(validateAvatarBytes(textBytes, 'image/jpeg')).toMatchObject({ ok: false });
expect(validateAvatarBytes(oversizedBytes, 'image/png')).toMatchObject({ ok: false });
```

- [ ] **Step 2: Run focused tests and verify failure**

```powershell
npm test -- lib/profile/__tests__/avatar-validation.test.ts
```

- [ ] **Step 3: Implement upload/confirm validation**

Avoid trusting the `type` query parameter. The upload route issues a short-lived path/token; the confirm route reads the uploaded object's bytes through a server-authorized path, verifies JPEG/PNG/WebP signatures and size ≤ 2 MB, then writes `avatar_url`. Reject a path that fails ownership, size, or magic bytes.

- [ ] **Step 4: Tighten profile promotion**

Replace `promote_to_profile_complete` so it requires non-empty `full_name`, `city`, `country`, `avatar_url`, `bio`, and one `preference_survey_responses` row. Keep the existing `phone_verified` prerequisite.

- [ ] **Step 5: Keep UI order aligned**

The profile page must show `Phone → Identity → Avatar → Bio → Survey`, prefill Google-provided name/avatar without declaring completion, and redirect locked actions to the appropriate missing step.

- [ ] **Step 6: Run focused tests**

```powershell
npm test -- lib/profile app/api/profile
```

Expected: PASS; TXT masquerading as JPEG is rejected.

### Task 5: Enforce feature access and affiliate limited/full semantics

**Files:**
- Modify: `app/api/recommendations/route.ts`
- Modify: `app/api/affiliate/link/route.ts`
- Modify: `lib/affiliate/links.ts`
- Modify: `lib/affiliate/clearing.ts`
- Modify: `lib/affiliate/redirect.ts`
- Modify: `lib/affiliate/attribution.ts`
- Modify: `app/api/stripe/create-checkout/route.ts`
- Modify: `app/api/stripe/create-order-checkout/route.ts`
- Modify: `app/customer/checkout/page.tsx`
- Modify: `app/api/phone/verify-otp/route.ts`
- Modify: `supabase/migrations/049_auth_verification_tier.sql`
- Test: `app/api/recommendations/__tests__/tier-gate.test.ts`
- Test: `app/api/affiliate/link/__tests__/tier-gate.test.ts`
- Test: `app/api/stripe/__tests__/phone-gate.test.ts`

**Consumes:** `tier_rank`, `phone_verified_at`, recommendation RPC, affiliate link records, affiliate clearing process, Stripe Checkout route.

**Produces:** Direct API/RPC enforcement for every approved tier rule.

- [ ] **Step 1: Write failing gate tests**

```ts
expect(canSubmitRecommendation('profile_complete')).toBe(true);
expect(canSubmitRecommendation('phone_verified')).toBe(false);
expect(canCreateAffiliateLink('profile_complete')).toEqual({ allowed: true, mode: 'limited' });
expect(canCreateAffiliateLink('kyc_verified')).toEqual({ allowed: true, mode: 'full' });
expect(canCheckout({ tier: 'kyc_verified', phoneVerifiedAt: null })).toBe(false);
```

- [ ] **Step 2: Run gate tests and verify failure**

```powershell
npm test -- app/api/recommendations app/api/affiliate app/api/stripe
```

- [ ] **Step 3: Implement server gates**

Require `email_verified_at`/tier for all authenticated actions; require `phone_verified_at IS NOT NULL` in both Stripe Checkout creation routes. Update the `orders_insert_own` and `bookings_insert_own` RLS `WITH CHECK` conditions to require a matching `public.users.phone_verified_at`, so the current client-side mock checkout cannot bypass the booking/purchase gate. The checkout page must surface a redirect/actionable error before attempting payment. Require `profile_complete` for recommendations and update the recommendation RPC too, so direct RPC calls are rejected.

- [ ] **Step 4: Implement affiliate modes**

At `profile_complete`, create or return one limited link and record resulting commissions as pending. At `kyc_verified`, retain the same link, apply full tier limits, and permit clearing to the earnings wallet. KYC suspension/rejection disables the link and removes eligibility without deleting history.

- [ ] **Step 5: Handle phone changes**

When a user changes phone, clear `phone_verified_at`; only Twilio's existing verification route sets it again. Do not downgrade KYC/profile data.

- [ ] **Step 6: Run focused tests**

```powershell
npm test -- app/api/recommendations app/api/affiliate app/api/stripe app/api/phone
```

Expected: every blocked route returns 403 before changing state.

### Task 6: Render the KYC-backed Verified Contributor badge

**Files:**
- Create: `app/customer/profile/[userId]/page.tsx`
- Modify: `app/customer/recommendations/page.tsx`
- Reuse: `components/shared/verified-contributor-badge.tsx`
- Test: `app/customer/profile/[userId]/__tests__/page.test.tsx`
- Test: `app/customer/recommendations/__tests__/badge.test.tsx`

**Consumes:** `public_users.is_kyc_verified` and the existing badge component.

**Produces:** Badge visibility only for KYC-verified public authors.

- [ ] **Step 1: Write failing renderer tests**

```tsx
expect(renderAuthor({ isKycVerified: true })).toContain('Verified Contributor');
expect(renderAuthor({ isKycVerified: false })).not.toContain('Verified Contributor');
```

- [ ] **Step 2: Implement badge placement**

Build the minimal public customer profile page from `public_users` via `getPublicUsers`, and place the badge beside the displayed profile name. Retain and verify the existing recommendation-card placement in `app/customer/recommendations/page.tsx`. Pass only the `is_kyc_verified` public-view flag to the badge component. Do not expose KYC documents, status notes, IC data, or private profile fields.

- [ ] **Step 3: Run renderer tests**

```powershell
npm test -- components/shared app/customer
```

Expected: only verified authors display the badge.

### Task 7: End-to-end verification and handoff

**Files:**
- Modify: no tracked credential files.
- Reference: `Docs/superpowers/plans/2026-07-15-auth-verification-google.md`

- [ ] **Step 1: Run the automated suite**

```powershell
npm test
npx tsc --noEmit
```

Expected: both commands pass.

- [ ] **Step 2: Run manual hosted-Supabase checks**

1. Email/password signup sends a 6-digit OTP; no session before confirmation.
2. OTP confirmation makes one public user row with `email_verified_at` and `tier=email_verified`.
3. A Google Test User signs in, gets one linked identity/profile, and reaches Explore.
4. The same email through password and Google has one `auth.users`/`public.users` account.
5. A different Google email creates no unsafe link.
6. Phone change blocks checkout until Twilio verification.
7. TXT avatar upload fails; valid JPEG/PNG/WebP succeeds.
8. Recommendation, affiliate, checkout, and withdrawal gates match the approved tier table.

- [ ] **Step 3: Inspect the diff before integration**

```powershell
git diff --check
git status --short
```

Confirm that `app/api/admin/kyc/submissions/route.ts` remains the separate pre-existing change and that no unrelated module was changed.

## Plan self-review

- Coverage: every confirmed decision has a task: email/password/OTP, Google Test Users, unverified tier, password policy, account linking, profile country/survey/avatar, feature gates, affiliate modes, public badge, and regression tests.
- Scope: excludes Vendor, Chat, Admin AI, and order fulfilment; only direct Auth/Verification/Gate boundaries are touched.
- Dependencies: Task 1 is a user-owned dashboard prerequisite; Tasks 2–6 are code/migration work; Task 7 cannot pass the hosted flow until Task 1 is complete.
