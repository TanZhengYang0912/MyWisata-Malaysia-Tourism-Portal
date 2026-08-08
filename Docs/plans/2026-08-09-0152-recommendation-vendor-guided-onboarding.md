# Recommendation Vendor Guided Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Ready for execution
**Design:** `Docs/superpowers/specs/2026-08-09-recommendation-vendor-guided-onboarding-design.md`

**Goal:** Replace the recommendation claim form with a guided three-step journey that creates or authenticates the invited account, reuses User Phone OTP, and atomically creates a pending Vendor with its first Outlet.

**Architecture:** Keep `/vendor-invite` public and token-scoped. Resolve invitations through one privacy-safe server helper, perform Email OTP through invitation-bound server routes, and keep Google OAuth on the existing safe callback. A new wizard owns draft/UI state, while the claim API and a replacement database RPC remain authoritative for email match, phone verification, category state, single use, and atomic Vendor/Profile/Outlet creation.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Supabase Auth/Postgres/RLS, Zod, Twilio Verify, TailwindCSS, Vitest, Playwright.

## Global Constraints

- Preserve the existing ordinary Vendor self-registration flow.
- Preserve Customer authentication, Profile Phone OTP, Checkout, Booking, Wallet, Withdrawal, Payout, Outlet Manager invitation, and Admin Vendor review behavior.
- Use only Email OTP and Google for recommendation-recipient authentication; do not add password onboarding.
- Google identity email and authenticated User email must exactly match the invitation email after trimming and lower-casing.
- Reuse `users.phone` and `users.phone_verified_at`; do not add Vendor-specific phone verification.
- Keep private User mobile separate from optional Outlet business phone.
- Read the four active canonical categories from Supabase; never hard-code category UUIDs.
- Do not expose recommender identity, unmasked anonymous contact data, raw storage paths, token hashes, or raw invitation tokens in logs/analytics.
- Recommendation photos remain reference-only and use short-lived signed URLs.
- Claim creates Vendor, submitted onboarding profile, first Outlet, and claim atomically; no partial writes.
- Claim does not grant `vendor_owner`; existing Admin approval remains responsible for the role.
- No new npm dependency and no backfill of existing Vendor records.
- Use existing design tokens and `InternationalPhoneInput`.
- Use TDD for every behavior change: red test, minimal implementation, green test, focused commit.
- At implementation start, use `luna_worker` for one bounded read-only compatibility check; before final verification, use it once for privacy/permission review.

## Scope Boundaries

### Files expected to change

- `lib/recommendations/vendor-invite-access.ts` — shared active-invitation resolver.
- `lib/recommendations/vendor-invite-preview.ts` — expanded privacy-safe preview contract.
- `app/api/vendor-invite/preview/route.ts` — active categories, account verification state, and safe preview.
- `app/api/vendor-invite/auth/email/send/route.ts` — invitation-bound Email OTP send.
- `app/api/vendor-invite/auth/email/verify/route.ts` — invitation-bound Email OTP verification.
- `app/api/vendor/claim/route.ts` — guided claim payload and RPC boundary.
- `components/vendor/vendor-invite-client.tsx` — loading/error shell and wizard host.
- `components/vendor/vendor-invite-wizard.tsx` — three-step state and session draft.
- `components/vendor/vendor-invite-account-step.tsx` — Email OTP and Google.
- `components/vendor/vendor-invite-details-step.tsx` — Vendor/Outlet fields and category cards.
- `components/vendor/vendor-invite-phone-step.tsx` — existing User Phone OTP plus final summary.
- `supabase/migrations/095_recommendation_guided_vendor_claim.sql` — replacement atomic claim RPC.
- Focused tests listed in each task.

### Files explicitly not being redesigned

- `app/login/page.tsx`
- `app/customer/profile/page.tsx`
- `components/profile/profile-sections.tsx`
- `components/profile/international-phone-input.tsx`
- `app/api/phone/send-otp/route.ts`
- `app/api/phone/verify-otp/route.ts`
- `app/api/vendors/route.ts`
- `supabase/migrations/20260723000000_vendor_registration_with_outlet.sql`
- `app/api/admin/vendors/[id]/approve/route.ts`
- Outlet Manager invitation routes and migrations.
- Checkout, Booking, Wallet, Withdrawal, Stripe, and payout routes.

`components/vendor/vendor-claim-form.tsx` and `app/vendor/register/page.tsx` remain as legacy compatibility surfaces and are not reused by the new wizard. No new invitation email points to them.

### Database changes

- Add one forward-only migration, `095_recommendation_guided_vendor_claim.sql`.
- Replace the seven-argument `claim_vendor_recommendation` overload with an expanded category/Outlet-aware signature.
- No table, column, policy, or historical-row backfill is required.
- The replacement RPC adds active-category validation, first-Outlet insertion, submitted onboarding status, and per-User serialization.

### Risks

- Supabase Email OTP cookie propagation from a Route Handler must be verified in a real browser.
- OAuth may return with a different Google email; preview and claim must both fail closed.
- Calling existing `send-otp` for an already verified User clears prior verification; the UI must skip that call unless the User explicitly changes the mobile.
- Function overloading can leave the old RPC callable; the migration must drop the exact old signature before creating the new one.
- Concurrent claim requests can create duplicates without both advisory locking and invitation row locking.
- The active category can change after preview; the RPC must validate it again.
- Business phone may be blank even while private User phone is verified; schemas and SQL must not conflate them.

---

## Phase 1 — Safe invitation and authentication boundaries

### Task 1: Centralise active invitation resolution and expand the safe preview

**Files:**
- Create: `lib/recommendations/vendor-invite-access.ts`
- Create: `lib/recommendations/__tests__/vendor-invite-access.test.ts`
- Modify: `lib/recommendations/vendor-invite-preview.ts`
- Modify: `lib/recommendations/__tests__/vendor-invite-preview.test.ts`
- Modify: `app/api/vendor-invite/preview/route.ts`
- Modify: `app/api/vendor-invite/preview/__tests__/route.test.ts`

**Interfaces:**
- Produces: `resolveActiveVendorInvite(service, token): Promise<VendorInviteResolution>`.
- Produces: `VendorInvitePreview.account`, `VendorInvitePreview.categories`, and category-ID-based prefill.
- Consumes: `hashRecommendationInviteToken`, existing service client, existing signed-image flow.

- [ ] **Step 1: Write failing invitation-resolution tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { resolveActiveVendorInvite } from '@/lib/recommendations/vendor-invite-access';

function makeService(row: Record<string, unknown> | null, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  return { from: vi.fn().mockReturnValue({ select }) };
}

describe('resolveActiveVendorInvite', () => {
  it('returns only the recommendation id and bound email for an active invite', async () => {
    const service = makeService({
      recommendation_id: 'rec-1', email: 'Owner@Example.com', status: 'invited',
      expires_at: '2099-01-01T00:00:00.000Z',
    });

    await expect(resolveActiveVendorInvite(service as never, 'valid-invite-token-value')).resolves.toEqual({
      ok: true,
      invite: { recommendationId: 'rec-1', email: 'owner@example.com' },
    });
  });

  it.each([
    ['cancelled', 'INVITE_CANCELLED'],
    ['claimed', 'INVITE_ALREADY_CLAIMED'],
  ])('maps %s to %s without returning the row', async (status, code) => {
    const service = makeService({
      recommendation_id: 'rec-1', email: 'owner@example.com', status,
      expires_at: '2099-01-01T00:00:00.000Z',
    });
    const result = await resolveActiveVendorInvite(service as never, 'valid-invite-token-value');
    expect(result).toMatchObject({ ok: false, error: { code } });
  });
});
```

- [ ] **Step 2: Run the resolver test and verify RED**

Run: `npx vitest run lib/recommendations/__tests__/vendor-invite-access.test.ts --reporter=dot`
Expected: FAIL because `vendor-invite-access.ts` does not exist.

- [ ] **Step 3: Implement the active-invitation resolver**

```ts
export type VendorInviteErrorCode =
  | 'INVITE_INVALID' | 'INVITE_EXPIRED' | 'INVITE_CANCELLED' | 'INVITE_ALREADY_CLAIMED';

export type VendorInviteResolution =
  | { ok: true; invite: { recommendationId: string; email: string } }
  | { ok: false; error: { code: VendorInviteErrorCode; message: string; status: number } };

export async function resolveActiveVendorInvite(service: SupabaseClient, token: string): Promise<VendorInviteResolution> {
  const { data, error } = await service.from('vendor_recommendation_invites')
    .select('recommendation_id,email,status,expires_at')
    .eq('token_hash', hashRecommendationInviteToken(token)).maybeSingle();
  if (error || !data || !data.email) return fail('INVITE_INVALID', 'This invitation link is invalid.', 404);
  if (data.status === 'cancelled') return fail('INVITE_CANCELLED', 'This vendor invitation was cancelled.', 409);
  if (data.status !== 'invited') return fail('INVITE_ALREADY_CLAIMED', 'This vendor invitation has already been claimed.', 409);
  if (new Date(data.expires_at).getTime() <= Date.now()) return fail('INVITE_EXPIRED', 'This vendor invitation has expired.', 409);
  return { ok: true, invite: { recommendationId: data.recommendation_id, email: data.email.trim().toLowerCase() } };
}
```

- [ ] **Step 4: Expand preview contract tests**

Add assertions that signed-out output contains:

```ts
expect(body.data).toMatchObject({
  account: {
    authenticated: false,
    emailMatched: false,
    phoneVerified: false,
    maskedInviteEmail: 'o***@example.com',
    maskedVerifiedPhone: null,
  },
  categories: [
    { id: 'food-uuid', name: 'Food', slug: 'food' },
    { id: 'activity-uuid', name: 'Activity', slug: 'activity' },
  ],
  prefill: { categoryId: 'food-uuid', contactEmail: null, contactPhone: null },
});
expect(JSON.stringify(body)).not.toContain('recommender');
expect(JSON.stringify(body)).not.toContain('storage_path');
```

Add a matching-email case where `users.phone` is masked only after match and `phoneVerified` is true.

- [ ] **Step 5: Implement preview DTO and route changes**

Use this contract:

```ts
export type VendorInviteCategory = { id: string; name: string; slug: string };
export type VendorInvitePreview = {
  account: {
    authenticated: boolean;
    emailMatched: boolean;
    phoneVerified: boolean;
    maskedInviteEmail: string;
    maskedVerifiedPhone: string | null;
  };
  categories: VendorInviteCategory[];
  recommendation: {
    businessName: string; description: string | null; whyRecommend: string | null;
    categoryId: string | null; categoryName: string | null;
    locationName: string | null; formattedAddress: string | null;
    latitude: number | null; longitude: number | null;
    images: Array<{ id: string; url: string }>;
  };
  maskedContact: { email: string | null; phone: string | null };
  prefill: {
    businessName: string; legalBusinessName: string; description: string;
    categoryId: string; outletName: string; contactEmail: string | null;
    contactPhone: string | null; businessAddress: string;
    latitude: number | null; longitude: number | null;
  };
};
```

In the route, call `resolveActiveVendorInvite`, query `categories(id,name,slug)` where `is_active = true` ordered by `sort_order`, select recommendation `category_id,latitude,longitude,categories(id,name,slug)`, and select `users(phone,phone_verified_at)` only for a matching authenticated account.

- [ ] **Step 6: Run Task 1 tests**

Run:

```bash
npx vitest run \
  lib/recommendations/__tests__/vendor-invite-access.test.ts \
  lib/recommendations/__tests__/vendor-invite-preview.test.ts \
  app/api/vendor-invite/preview/__tests__/route.test.ts --reporter=dot
```

Expected: all Task 1 tests PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add lib/recommendations/vendor-invite-access.ts lib/recommendations/__tests__/vendor-invite-access.test.ts lib/recommendations/vendor-invite-preview.ts lib/recommendations/__tests__/vendor-invite-preview.test.ts app/api/vendor-invite/preview/route.ts app/api/vendor-invite/preview/__tests__/route.test.ts
git commit -m "feat: expand safe vendor invitation preview"
```

### Task 2: Add invitation-bound Email OTP routes

**Files:**
- Create: `app/api/vendor-invite/auth/email/send/route.ts`
- Create: `app/api/vendor-invite/auth/email/send/__tests__/route.test.ts`
- Create: `app/api/vendor-invite/auth/email/verify/route.ts`
- Create: `app/api/vendor-invite/auth/email/verify/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `resolveActiveVendorInvite(service, token)`.
- Produces: `POST /api/vendor-invite/auth/email/send` with `{ token }`.
- Produces: `POST /api/vendor-invite/auth/email/verify` with `{ token, code }` and authenticated cookies.

- [ ] **Step 1: Write failing route tests**

```ts
it('sends an OTP only to the server-resolved invitation email', async () => {
  mocks.resolve.mockResolvedValue({ ok: true, invite: { recommendationId: 'rec-1', email: 'owner@example.com' } });
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  const response = await POST(request({ token: 'valid-invite-token-value' }));
  expect(response.status).toBe(200);
  expect(mocks.signInWithOtp).toHaveBeenCalledWith({
    email: 'owner@example.com',
    options: { shouldCreateUser: true },
  });
});

it('verifies the code against the bound email and never accepts a client email', async () => {
  mocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: 'session' } }, error: null });
  const response = await POST(request({ token: 'valid-invite-token-value', code: '123456' }));
  expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: 'owner@example.com', token: '123456', type: 'email' });
  expect(response.status).toBe(200);
});
```

Include invalid, expired, wrong-code, and provider-rate-limit cases with stable codes `INVITE_*`, `OTP_INVALID`, and `OTP_RATE_LIMITED`.

- [ ] **Step 2: Run Email OTP tests and verify RED**

Run: `npx vitest run app/api/vendor-invite/auth/email/send/__tests__/route.test.ts app/api/vendor-invite/auth/email/verify/__tests__/route.test.ts --reporter=dot`
Expected: FAIL because both routes are missing.

- [ ] **Step 3: Implement strict schemas and send route**

```ts
const schema = z.object({ token: z.string().trim().min(16).max(200) }).strict();

export async function POST(request: Request) {
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const resolution = await resolveActiveVendorInvite(createServiceClient(), parsed.data.token);
  if (!resolution.ok) return apiFail(resolution.error.code, resolution.error.message, resolution.error.status);
  const db = await createClient();
  const { error } = await db.auth.signInWithOtp({
    email: resolution.invite.email,
    options: { shouldCreateUser: true },
  });
  if (error) return mapOtpSendError(error);
  return apiOk({ sent: true });
}
```

- [ ] **Step 4: Implement verification route**

```ts
const schema = z.object({
  token: z.string().trim().min(16).max(200),
  code: z.string().regex(/^\d{6}$/),
}).strict();

const { data, error } = await db.auth.verifyOtp({
  email: resolution.invite.email,
  token: parsed.data.code,
  type: 'email',
});
if (error || !data.session) return apiFail('OTP_INVALID', 'That code is invalid or has expired.', 422);
return apiOk({ verified: true });
```

Use the existing SSR Supabase server client so its cookie adapter persists the returned session. Do not return access or refresh tokens in JSON.

- [ ] **Step 5: Run Task 2 tests and type check**

Run:

```bash
npx vitest run app/api/vendor-invite/auth/email/send/__tests__/route.test.ts app/api/vendor-invite/auth/email/verify/__tests__/route.test.ts --reporter=dot
npx tsc --noEmit
```

Expected: route tests PASS; TypeScript exits 0.

- [ ] **Step 6: Commit Task 2**

```bash
git add app/api/vendor-invite/auth/email/send app/api/vendor-invite/auth/email/verify
git commit -m "feat: add invitation-bound email otp"
```

---

## Phase 2 — Atomic Vendor and first-Outlet creation

### Task 3: Replace the claim RPC and claim API contract

**Files:**
- Create: `supabase/migrations/095_recommendation_guided_vendor_claim.sql`
- Create: `supabase/migrations/__tests__/095_recommendation_guided_vendor_claim.test.ts`
- Modify: `app/api/vendor/claim/route.ts`
- Modify: `app/api/vendor/claim/__tests__/route.test.ts`

**Interfaces:**
- Produces request type:

```ts
type GuidedVendorClaimInput = {
  token: string;
  businessName: string;
  legalBusinessName: string;
  description: string;
  categoryId: string;
  outletName: string;
  contactEmail: string;
  contactPhone?: string;
  businessAddress: string;
  latitude?: number | null;
  longitude?: number | null;
  authorizedToRepresent: true;
};
```

- Produces RPC result `{ vendor_id, outlet_id, recommendation_id, status: 'onboarding' }`.
- Consumes existing User auth/phone state and recommendation invitation tables.

- [ ] **Step 1: Write failing API tests for the guided payload**

```ts
const validBody = {
  token: 'invite-token-value', businessName: 'Rasa Malaysia Kitchen',
  legalBusinessName: 'Rasa Malaysia Kitchen Sdn Bhd',
  description: 'Malaysian food and local dining experiences.',
  categoryId: '11111111-0000-0000-0000-000000000001',
  outletName: 'Rasa Malaysia Kitchen — Jalan Alor',
  contactEmail: 'owner@example.com', contactPhone: '',
  businessAddress: '12 Jalan Alor, Kuala Lumpur',
  latitude: 3.145, longitude: 101.708,
  authorizedToRepresent: true,
};

expect(mocks.rpc).toHaveBeenCalledWith('claim_vendor_recommendation', expect.objectContaining({
  p_category_id: validBody.categoryId,
  p_outlet_name: validBody.outletName,
  p_contact_phone: null,
  p_latitude: validBody.latitude,
  p_longitude: validBody.longitude,
}));
```

Add tests that reject `authorizedToRepresent: false`, invalid category UUID, missing Outlet name, invalid coordinates, and unverified User phone before RPC execution.

- [ ] **Step 2: Write the failing migration contract test**

```ts
const sql = readFileSync(new URL('../095_recommendation_guided_vendor_claim.sql', import.meta.url), 'utf8');
expect(sql).toContain('DROP FUNCTION IF EXISTS public.claim_vendor_recommendation(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)');
expect(sql).toContain("pg_advisory_xact_lock(hashtext('claim_vendor_recommendation')");
expect(sql).toContain("c.is_active = TRUE");
expect(sql).toContain("'submitted'");
expect(sql).toContain("INSERT INTO public.outlets");
expect(sql).toContain("'inactive', 'pending_review'");
expect(sql).not.toContain("INSERT INTO public.user_roles");
```

- [ ] **Step 3: Run Task 3 tests and verify RED**

Run: `npx vitest run app/api/vendor/claim/__tests__/route.test.ts supabase/migrations/__tests__/095_recommendation_guided_vendor_claim.test.ts --reporter=dot`
Expected: FAIL because the new schema/signature and migration are absent.

- [ ] **Step 4: Implement the strict claim schema and RPC mapping**

```ts
const uuid = z.string().uuid();
const claimSchema = z.object({
  token: z.string().trim().min(16).max(200),
  businessName: z.string().trim().min(2).max(255),
  legalBusinessName: z.string().trim().min(2).max(255),
  description: z.string().trim().min(10).max(2000),
  categoryId: uuid,
  outletName: z.string().trim().min(2).max(255),
  contactEmail: z.string().trim().email().max(255),
  contactPhone: z.string().trim().max(50).optional().or(z.literal('')),
  businessAddress: z.string().trim().min(5).max(500),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  authorizedToRepresent: z.literal(true),
}).strict();
```

Keep the existing authenticated User and `phone_verified_at` pre-check. Pass empty optional business phone as `null`.

- [ ] **Step 5: Implement migration 095**

The migration must first drop the old seven-argument overload, then define this exact replacement interface (with a complete PL/pgSQL body):

```sql
DROP FUNCTION IF EXISTS public.claim_vendor_recommendation(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE FUNCTION public.claim_vendor_recommendation(
  p_token_hash TEXT,
  p_business_name TEXT,
  p_legal_business_name TEXT,
  p_description TEXT,
  p_category_id UUID,
  p_outlet_name TEXT,
  p_contact_email TEXT,
  p_contact_phone TEXT,
  p_business_address TEXT,
  p_latitude DOUBLE PRECISION,
  p_longitude DOUBLE PRECISION
) RETURNS JSONB
```

Implement the function body by adapting the already-tested locking and exception structure from migration 083 and the Vendor/Profile/Outlet insertion structure from `20260723000000_vendor_registration_with_outlet.sql`. The body must perform this exact order inside one transaction:

1. Resolve `auth.uid()`; raise `not_authenticated` if absent.
2. Acquire `pg_advisory_xact_lock(hashtext('claim_vendor_recommendation'), hashtext(auth.uid()::text))` before any existence check.
3. Select the authenticated `users` row and require non-null `phone_verified_at`; raise the existing `phone_verification_required` exception otherwise.
4. Select the invitation by `p_token_hash FOR UPDATE`; distinguish invalid, expired, cancelled, and already-claimed states using the stable exception strings already mapped by the API.
5. Compare lower-cased authenticated email, invitation email, and `p_contact_email`; raise `email_mismatch` before creating any row.
6. While still holding the per-User lock, reject an existing pending or approved Vendor owned by this User with `owner_already_has_vendor`; then lock the recommendation row and reject any prior claim for either the User or invitation.
7. Select the category as alias `c` with `c.id = p_category_id AND c.is_active = TRUE`; raise `category_not_active` when absent.
8. Generate collision-safe Vendor and Outlet slugs using the same retry/suffix convention as the self-registration RPC.
9. Insert one pending Vendor using the category slug for `business_type`, `p_business_name`, and `p_description`.
10. Insert one submitted `vendor_onboarding_profiles` row containing the legal name and business contact fields, without copying the private User phone unless `p_contact_phone` was explicitly supplied.
11. Insert one first Outlet with `status = 'inactive'`, `review_status = 'pending_review'`, `address`, optional `phone`, `email`, `lat`, and `lng`. The selected category remains Vendor-level through `vendors.business_type`; do not invent an Outlet category column.
12. Insert one `vendor_recommendation_claims` row, mark the invitation claimed, update the recommendation lifecycle exactly as migration 083 does, and return the Vendor/Profile/Outlet/Claim IDs as JSONB.

Write every guard as executable PL/pgSQL—no comment placeholders. Revoke execution from `PUBLIC, anon`; grant only to `authenticated, service_role` as appropriate. Do not insert `user_roles`.

- [ ] **Step 6: Run Task 3 tests**

Run:

```bash
npx vitest run app/api/vendor/claim/__tests__/route.test.ts supabase/migrations/__tests__/095_recommendation_guided_vendor_claim.test.ts --reporter=dot
npx vitest run supabase/migrations/__tests__/083_vendor_recommendation_claim_onboarding.test.ts supabase/migrations/__tests__/20260723000000_vendor_registration_with_outlet.test.ts --reporter=dot
```

Expected: guided claim and existing self-registration contract tests PASS. If the 083 test asserts the superseded signature, update that test to assert lifecycle/conversion behavior only; do not edit migration 083.

- [ ] **Step 7: Commit Task 3**

```bash
git add supabase/migrations/095_recommendation_guided_vendor_claim.sql supabase/migrations/__tests__/095_recommendation_guided_vendor_claim.test.ts supabase/migrations/__tests__/083_vendor_recommendation_claim_onboarding.test.ts app/api/vendor/claim/route.ts app/api/vendor/claim/__tests__/route.test.ts
git commit -m "feat: atomically claim vendor with first outlet"
```

---

## Phase 3 — Guided onboarding UI

### Task 4: Build wizard draft state, account step, and Vendor/Outlet review

**Files:**
- Create: `components/vendor/vendor-invite-wizard.tsx`
- Create: `components/vendor/vendor-invite-account-step.tsx`
- Create: `components/vendor/vendor-invite-details-step.tsx`
- Create: `components/vendor/__tests__/vendor-invite-wizard.test.tsx`
- Modify: `components/vendor/vendor-invite-client.tsx`
- Modify: `app/vendor-invite/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: expanded `VendorInvitePreview` and Email OTP endpoints.
- Produces: `VendorInviteDraft`, `VendorInviteStep = 'account' | 'details' | 'verify'`.
- Produces: session key `mywisata.vendor-invite-wizard-v2` scoped to a hash/fingerprint of the token, never a logged token.

- [ ] **Step 1: Write failing wizard behavior tests**

Use React Testing Library to assert:

```tsx
render(<VendorInviteWizard token="test-token-value" preview={signedOutPreview} onReload={reload} />);
expect(screen.getByText('Step 1 of 3')).toBeVisible();
expect(screen.getByRole('button', { name: 'Send 6-digit email code' })).toBeEnabled();
expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();

render(<VendorInviteWizard token="test-token-value" preview={matchingPreview} onReload={reload} />);
await user.click(screen.getByRole('button', { name: 'Continue' }));
expect(screen.getByText('Step 2 of 3')).toBeVisible();
expect(screen.getByRole('radio', { name: 'Activity' })).toBeChecked();
expect(screen.getByLabelText('First outlet name')).toHaveValue('Testing123 — Bukit Damansara');
```

Also assert Vendor and Outlet headings, optional business phone, editable prefill, Google callback URL containing the encoded invitation return path, and no password field.

- [ ] **Step 2: Run wizard tests and verify RED**

Run: `npx vitest run components/vendor/__tests__/vendor-invite-wizard.test.tsx app/vendor-invite/__tests__/page.test.tsx --reporter=dot`
Expected: FAIL because wizard components do not exist.

- [ ] **Step 3: Define draft and step contracts**

```ts
export type VendorInviteStep = 'account' | 'details' | 'verify';
export type VendorInviteDraft = {
  businessName: string;
  legalBusinessName: string;
  description: string;
  categoryId: string;
  outletName: string;
  contactEmail: string;
  contactPhone: string;
  businessAddress: string;
  latitude: number | null;
  longitude: number | null;
  authorizedToRepresent: boolean;
};
```

Initial values come from `preview.prefill`. Persist `{ version: 2, tokenFingerprint, step, draft, dirtyFields }`; never persist auth tokens or OTP codes. Merge newly unlocked contact values only into untouched fields.

- [ ] **Step 4: Implement Account step**

Account step states are `choose | email-code | busy | mismatch`. Send/verify through the new server routes. Google uses:

```ts
const next = `/vendor-invite?recommendation=${encodeURIComponent(token)}`;
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
});
```

After Email OTP verification, call `onReload()` so the server re-evaluates authentication and email match. Do not accept or send a client-provided email.

- [ ] **Step 5: Implement Details step**

Render separate “Vendor brand” and “First outlet” sections. Render categories as accessible radios:

```tsx
{preview.categories.map((category) => (
  <label key={category.id} className={category.id === draft.categoryId ? selectedClass : defaultClass}>
    <input type="radio" name="category" value={category.id}
      checked={category.id === draft.categoryId}
      onChange={() => update('categoryId', category.id)} />
    {category.name}
  </label>
))}
```

Business phone is optional. Recommendation description/reason/photos remain visible reference evidence; edited Vendor description is kept in the draft without mutating recommendation rows.

- [ ] **Step 6: Integrate wizard into the invite client**

Replace `VendorClaimForm` usage in `vendor-invite-client.tsx` with:

```tsx
<VendorInviteWizard token={token} preview={preview} onReload={loadPreview} />
```

Retain loading, invalid, expired, cancelled, already-used, and retry states. Add “Request a new invitation” and “Contact MyWisata support” recovery links where an existing route is available; otherwise use the existing support entry route rather than inventing an API.

- [ ] **Step 7: Run Task 4 tests and lint**

Run:

```bash
npx vitest run components/vendor/__tests__/vendor-invite-wizard.test.tsx app/vendor-invite/__tests__/page.test.tsx --reporter=dot
npx eslint components/vendor/vendor-invite-wizard.tsx components/vendor/vendor-invite-account-step.tsx components/vendor/vendor-invite-details-step.tsx components/vendor/vendor-invite-client.tsx
```

Expected: tests PASS; ESLint reports 0 errors in changed files.

- [ ] **Step 8: Commit Task 4**

```bash
git add components/vendor/vendor-invite-wizard.tsx components/vendor/vendor-invite-account-step.tsx components/vendor/vendor-invite-details-step.tsx components/vendor/vendor-invite-client.tsx components/vendor/__tests__/vendor-invite-wizard.test.tsx app/vendor-invite/__tests__/page.test.tsx
git commit -m "feat: add guided vendor invitation wizard"
```

### Task 5: Add inline User Phone OTP, final review, and submission recovery

**Files:**
- Create: `components/vendor/vendor-invite-phone-step.tsx`
- Create: `components/vendor/__tests__/vendor-invite-phone-step.test.tsx`
- Modify: `components/vendor/vendor-invite-wizard.tsx`
- Modify: `components/vendor/__tests__/vendor-invite-wizard.test.tsx`

**Interfaces:**
- Consumes existing `InternationalPhoneInput`, `/api/phone/send-otp`, `/api/phone/verify-otp`, and `/api/vendor/claim`.
- Produces verified skip state, six-digit OTP state, final summary, submit state, and submitted confirmation.

- [ ] **Step 1: Write failing Phone step tests**

```tsx
render(<VendorInvitePhoneStep preview={verifiedPreview} draft={draft} onVerified={reload} onSubmit={submit} />);
expect(screen.getByText('Mobile verified')).toBeVisible();
expect(screen.queryByRole('button', { name: 'Send phone OTP' })).not.toBeInTheDocument();

render(<VendorInvitePhoneStep preview={unverifiedPreview} draft={draft} onVerified={reload} onSubmit={submit} />);
expect(screen.getByLabelText('Personal mobile number')).toBeVisible();
expect(screen.getByRole('button', { name: 'Send phone OTP' })).toBeEnabled();
expect(screen.getByText('This number stays private.')).toBeVisible();
```

Add tests for expired OTP, rate limit, phone collision, six separate accessible digits, resend countdown, “Use this mobile as Outlet contact” explicit opt-in, submit lock, and preserving draft on claim failure.

- [ ] **Step 2: Run Phone tests and verify RED**

Run: `npx vitest run components/vendor/__tests__/vendor-invite-phone-step.test.tsx --reporter=dot`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement verified skip and inline OTP**

If `preview.account.phoneVerified` is true, render `maskedVerifiedPhone` and never call send OTP. Otherwise:

```ts
await fetch('/api/phone/send-otp', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: personalMobile }),
});

await fetch('/api/phone/verify-otp', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone: personalMobile, code: otpDigits.join('') }),
});
```

Map `PHONE_ALREADY_CLAIMED`, `RATE_LIMITED`, invalid/expired OTP, and provider-unavailable codes to the approved recovery copy. Never put the OTP into session storage.

- [ ] **Step 4: Implement final summary and claim submission**

Require `authorizedToRepresent`. POST the exact `GuidedVendorClaimInput`. Disable Back and Submit while the request is running. On 201, clear the v2 draft and render:

```tsx
<h2>Vendor application submitted</h2>
<p>Your Vendor and first Outlet are private while MyWisata reviews the application.</p>
```

Map claim errors by visible area: category inactive returns to Details/category, email mismatch returns to Account, phone verification returns to Verify, and invite state becomes the dedicated inactive-invitation page. Raw `field: Invalid input` messages are never rendered.

- [ ] **Step 5: Run Task 5 tests and focused regression**

Run:

```bash
npx vitest run components/vendor/__tests__/vendor-invite-phone-step.test.tsx components/vendor/__tests__/vendor-invite-wizard.test.tsx app/api/phone app/api/vendor/claim --reporter=dot
npx eslint components/vendor/vendor-invite-phone-step.tsx components/vendor/vendor-invite-wizard.tsx
```

Expected: all focused tests PASS; 0 lint errors in changed files.

- [ ] **Step 6: Commit Task 5**

```bash
git add components/vendor/vendor-invite-phone-step.tsx components/vendor/__tests__/vendor-invite-phone-step.test.tsx components/vendor/vendor-invite-wizard.tsx components/vendor/__tests__/vendor-invite-wizard.test.tsx
git commit -m "feat: complete vendor invite verification flow"
```

---

## Phase 4 — Compatibility, privacy, and browser verification

### Task 6: Verify the complete flow and protect existing systems

**Files:**
- Modify only if a failing requirement is found: focused feature files from Tasks 1–5.
- Test: existing suites listed below.
- Optional create, only if the repository already tracks local e2e tests for this area: `tests/e2e/vendor-recommendation-onboarding.spec.ts`.

**Interfaces:**
- Consumes all prior task outputs.
- Produces verification evidence; no new production interface.

- [ ] **Step 1: Run the complete focused test matrix**

```bash
npx vitest run \
  lib/recommendations/__tests__/vendor-invite-access.test.ts \
  lib/recommendations/__tests__/vendor-invite-preview.test.ts \
  app/api/vendor-invite/preview/__tests__/route.test.ts \
  app/api/vendor-invite/auth/email/send/__tests__/route.test.ts \
  app/api/vendor-invite/auth/email/verify/__tests__/route.test.ts \
  app/api/vendor/claim/__tests__/route.test.ts \
  components/vendor/__tests__/vendor-invite-wizard.test.tsx \
  components/vendor/__tests__/vendor-invite-phone-step.test.tsx \
  app/vendor-invite/__tests__/page.test.tsx \
  app/api/admin/vendors/recommendation-invite/__tests__/route.test.ts \
  lib/email/__tests__/vendor-claim-invite.test.ts \
  supabase/migrations/__tests__/095_recommendation_guided_vendor_claim.test.ts \
  supabase/migrations/__tests__/20260723000000_vendor_registration_with_outlet.test.ts \
  app/api/admin/vendors/[id]/approve/__tests__/route.test.ts \
  app/api/outlet-manager-invitations --reporter=dot
```

Expected: all focused suites PASS.

- [ ] **Step 2: Run full static and regression verification**

```bash
npx tsc --noEmit
npm run lint
npm test -- --reporter=dot
```

Expected: TypeScript exits 0; ESLint has 0 errors (existing warnings may remain); full Vitest suite has 0 failed tests.

- [ ] **Step 3: Perform the required `luna_worker` privacy review**

Delegate one read-only bounded review of only the feature commits. Require exact file/line findings for:

- anonymous unmasked invitation email/contact leakage;
- raw token/hash/storage-path logging or persistence;
- Google/email mismatch bypass;
- User phone vs Outlet phone conflation;
- missing server/RPC enforcement;
- accidental early `vendor_owner` or `outlet_manager` assignment.

Review each returned finding locally before changing code. Do not wait beyond the project’s bounded review timeout.

- [ ] **Step 4: Run Playwright in isolated browser contexts**

Verify against `http://localhost:3000` using Webpack dev mode if Turbopack repeats the known runaway compile behavior:

1. Signed-out active invitation shows masked data and Step 1.
2. Email OTP creates/signs in the bound account and returns to the same invitation.
3. Google mismatch is blocked; matching Google continues.
4. Unverified User completes inline Phone OTP without leaving the wizard.
5. Verified User skips Phone OTP and no send request occurs.
6. Category uses four active DB options and original selection.
7. Vendor/Outlet edits survive auth redirect and OTP failures.
8. Submit creates one pending Vendor and one inactive/pending-review Outlet.
9. Replay shows inactive/used state and creates nothing else.
10. A second context cannot use the same verified phone.

Never print or screenshot a raw invitation token, OTP, full private mobile, or unmasked private email.

- [ ] **Step 5: Inspect database outcomes with read-only queries**

For the test claim, verify exactly one row in each of `vendors`, `vendor_onboarding_profiles`, `outlets`, and `vendor_recommendation_claims`; verify statuses and that no `vendor_owner`/`outlet_manager` role was granted before Admin approval. Then approve through the existing Admin flow and verify only `vendor_owner` is added.

- [ ] **Step 6: Commit any verification-only test additions**

If Task 6 required a tracked e2e test or a narrowly scoped repair:

```bash
git add tests/e2e/vendor-recommendation-onboarding.spec.ts <only-the-feature-files-actually-changed>
git commit -m "test: verify guided vendor recommendation onboarding"
```

If no file changed, do not create an empty commit.

## Final Acceptance Checklist

- [ ] A recipient with no account completes the entire flow without visiting generic registration.
- [ ] Email OTP and matching Google can create/authenticate the bound account.
- [ ] Existing verified User phone skips OTP; unverified User verifies inline.
- [ ] Private User mobile and optional Outlet business phone remain distinct.
- [ ] Vendor, submitted onboarding profile, and first Outlet are atomic.
- [ ] Category uses one active Supabase UUID and displays the four canonical choices.
- [ ] Admin approval remains the only path to active Vendor Owner role/public Vendor status.
- [ ] Outlet Manager is not created or assigned.
- [ ] Error states are user-friendly and preserve drafts.
- [ ] No sensitive invitation or storage data is exposed.
- [ ] Self-registration and all existing verification/commerce/admin flows pass regression tests.
