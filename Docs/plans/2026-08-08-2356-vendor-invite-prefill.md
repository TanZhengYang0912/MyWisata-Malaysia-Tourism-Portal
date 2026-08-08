# Vendor Invite Prefill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. For this connected feature, the project execution policy prefers Inline Execution with one final review. Use `luna_worker` only for the independent privacy/permission verification in Task 4.

**Status:** ready for implementation

**Goal:** Replace the empty, login-gated recommendation claim experience with a public token invitation page that shows safe recommendation evidence and pre-fills the fixed editable Vendor Draft form.

**Architecture:** New invitations point to a top-level `/vendor-invite` page outside the protected Vendor layout. A read-only preview API hashes the token and returns either a safe masked DTO or, after invitation-email authentication, a full prefill DTO; the existing claim API/RPC remains the only write boundary. Browser session storage preserves edits across authentication without changing recommendation evidence.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Supabase Auth/Postgres/Storage, Zod, Vitest.

## Global Constraints

- Keep the fixed form to Business name, Legal business name, Business type, Contact email, Contact phone, and Business address.
- Default Legal business name to Business name and Business type to recommendation category.
- Never expose recommender identity, raw image storage paths, Admin review notes, or unmasked contact values before invitation-email authentication.
- Recommendation photos are reference-only and are not copied into Vendor media.
- Vendor edits create a private Vendor Draft and never update recommendation evidence.
- Keep phone verification, email binding, token expiry, cancellation, and single-use checks authoritative at claim time.
- Keep all existing `/vendor/*` portal authentication unchanged; new emails use `/vendor-invite`.
- Add no dependency and no database migration.

## Context and scope

The existing `app/vendor/register/page.tsx` is wrapped by `app/vendor/layout.tsx`, which redirects signed-out recipients to login. `components/vendor/vendor-claim-form.tsx` initializes every field as empty even though `vendor_recommendations` already stores the approved name, category, Google address, contact evidence, description, reason, and images. `claim_vendor_recommendation` already performs the required atomic write and must remain the final authority.

Files intentionally not touched: `app/vendor/layout.tsx`, Vendor dashboard pages, Admin recommendation review, recommendation reward logic, public Vendor profile rendering, and the claim database RPC. There are no schema changes.

---

### Task 1: Safe invitation preview contract and API

**Files:**
- Create: `lib/recommendations/vendor-invite-preview.ts`
- Create: `lib/recommendations/__tests__/vendor-invite-preview.test.ts`
- Create: `app/api/vendor-invite/preview/route.ts`
- Create: `app/api/vendor-invite/preview/__tests__/route.test.ts`

**Interfaces:**
- Consumes: raw token from POST JSON `{ token: string }`, Supabase session if present, service-role reads of the invite/recommendation/category/image rows.
- Produces: `VendorInvitePreview`, `maskInviteEmail`, `maskInvitePhone`, and `POST /api/vendor-invite/preview`.

- [ ] **Step 1: Write failing pure-contract tests**

```ts
import { describe, expect, it } from 'vitest';
import { buildVendorInvitePreview, maskInviteEmail, maskInvitePhone } from '../vendor-invite-preview';

const baseInput = {
  emailMatched: false,
  authenticated: false,
  phoneVerified: false,
  inviteEmail: 'owner@example.com',
  recommendation: {
    vendor_name: 'Rasa Malaysia Kitchen', description: 'Local Malaysian food.',
    why_recommend: 'Consistent food and welcoming service.', category_name: 'Food',
    location_name: 'Rasa Malaysia Kitchen',
    formatted_address: '12 Jalan Alor, Kuala Lumpur', vendor_address: null,
    contact_email: 'owner@example.com', contact_phone: '+60123456789',
  },
  images: [{ id: 'image-1', signedUrl: 'https://signed.example/image-1' }],
};

it('maps safe defaults without private identity', () => {
  const preview = buildVendorInvitePreview(baseInput);
  expect(preview.prefill).toMatchObject({
    businessName: 'Rasa Malaysia Kitchen', legalBusinessName: 'Rasa Malaysia Kitchen',
    businessType: 'Food', businessAddress: '12 Jalan Alor, Kuala Lumpur',
    contactEmail: null, contactPhone: null,
  });
  expect(preview.maskedContact).toEqual({ email: 'o***@example.com', phone: '*******6789' });
  expect(JSON.stringify(preview)).not.toContain('recommender');
});

it('reveals contacts only after email match', () => {
  expect(buildVendorInvitePreview({ ...baseInput, authenticated: true, emailMatched: true }).prefill).toMatchObject({
    contactEmail: 'owner@example.com', contactPhone: '+60123456789',
  });
});

it('masks without leaking the original value', () => {
  expect(maskInviteEmail('owner@example.com')).toBe('o***@example.com');
  expect(maskInvitePhone('+60123456789')).toBe('*******6789');
});
```

- [ ] **Step 2: Run the pure test and confirm RED**

Run: `npx vitest run lib/recommendations/__tests__/vendor-invite-preview.test.ts`

Expected: FAIL because `vendor-invite-preview.ts` does not exist.

- [ ] **Step 3: Implement the typed mapper**

```ts
export type VendorInvitePreview = {
  authenticated: boolean;
  emailMatched: boolean;
  phoneVerified: boolean;
  recommendation: {
    businessName: string;
    description: string | null;
    whyRecommend: string | null;
    category: string | null;
    locationName: string | null;
    formattedAddress: string | null;
    images: Array<{ id: string; url: string }>;
  };
  maskedContact: { email: string | null; phone: string | null };
  prefill: {
    businessName: string;
    legalBusinessName: string;
    businessType: string;
    contactEmail: string | null;
    contactPhone: string | null;
    businessAddress: string;
  };
};
```

`buildVendorInvitePreview` must use `formatted_address ?? vendor_address ?? ''`, reveal contact values only when `emailMatched === true`, and never accept recommender/profile fields in its input contract.

- [ ] **Step 4: Write failing API route tests**

Test these exact outcomes with mocked server/service clients:

```ts
const response = await POST(new Request('http://localhost/api/vendor-invite/preview', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token: 'valid-invite-token-value' }),
}));
expect(response.status).toBe(200);
const body = await response.json();
expect(body).toMatchObject({ data: { emailMatched: false, prefill: { contactEmail: null } } });
expect(JSON.stringify(body)).not.toContain('storage_path');

expect(await matchedResponse.json()).toMatchObject({ data: { emailMatched: true, prefill: { contactEmail: 'owner@example.com' } } });
expect(await expiredResponse.json()).toMatchObject({ error: { code: 'INVITE_EXPIRED' } });
expect(await claimedResponse.json()).toMatchObject({ error: { code: 'INVITE_ALREADY_CLAIMED' } });
```

- [ ] **Step 5: Implement `POST /api/vendor-invite/preview`**

Validate `{ token: z.string().trim().min(16).max(200) }`; hash with `hashRecommendationInviteToken`; resolve the invitation by `token_hash`; reject missing, expired, cancelled, or non-`invited` rows using stable codes. Query only approved/invited recommendation evidence and active image metadata. Create signed URLs with a 10-minute expiry. Use the cookie client only to obtain the optional auth user and `users.phone_verified_at`; compare normalized account email to `invite.email`. Pass rows to `buildVendorInvitePreview` and return `apiOk(preview)`.

Do not log the token and do not include `token_hash`, `recommender_id`, reviewer fields, or `storage_path` in the response.

- [ ] **Step 6: Run focused tests and commit**

Run: `npx vitest run lib/recommendations/__tests__/vendor-invite-preview.test.ts app/api/vendor-invite/preview/__tests__/route.test.ts`

Expected: PASS.

```bash
git add lib/recommendations/vendor-invite-preview.ts lib/recommendations/__tests__/vendor-invite-preview.test.ts app/api/vendor-invite/preview/route.ts app/api/vendor-invite/preview/__tests__/route.test.ts
git commit -m "feat: add safe vendor invite preview"
```

### Task 2: Public invitation page and editable pre-filled form

**Files:**
- Create: `app/vendor-invite/page.tsx`
- Create: `components/vendor/vendor-invite-client.tsx`
- Create: `app/vendor-invite/__tests__/page.test.tsx`
- Modify: `components/vendor/vendor-claim-form.tsx`
- Modify: `app/vendor/register/__tests__/page.spec.tsx`

**Interfaces:**
- Consumes: `POST /api/vendor-invite/preview` and the Task 1 `VendorInvitePreview` DTO.
- Produces: a public `/vendor-invite?recommendation=<token>` page and `VendorClaimForm` props `{ token, initialValues, authenticated, emailMatched, phoneVerified }`.

- [ ] **Step 1: Write failing page/form contract tests**

```ts
expect(pageSource).toContain('VendorInviteClient');
expect(clientSource).toContain('Recommendation details');
expect(clientSource).toContain('A MyWisata member recommended this business.');
expect(clientSource).toContain('Pre-filled from a customer recommendation');
expect(clientSource).not.toContain('recommender.email');
expect(formSource).toContain('initialValues');
expect(formSource).toContain('sessionStorage');
expect(formSource).toContain('/login?next=');
```

Add a regression assertion that `app/vendor/layout.tsx` is not imported by the new top-level page and keep the legacy `/vendor/register` test intact.

- [ ] **Step 2: Run the page test and confirm RED**

Run: `npx vitest run app/vendor-invite/__tests__/page.test.tsx app/vendor/register/__tests__/page.spec.tsx`

Expected: FAIL because the public page/client and prefill props do not exist.

- [ ] **Step 3: Add the public server page**

```tsx
import VendorInviteClient from '@/components/vendor/vendor-invite-client';

export default async function VendorInvitePage({ searchParams }: {
  searchParams: Promise<{ recommendation?: string }>;
}) {
  const { recommendation = '' } = await searchParams;
  return <VendorInviteClient token={recommendation} />;
}
```

- [ ] **Step 4: Implement the client state machine**

Use states `loading | ready | invalid | expired | cancelled | claimed | failed`. Fetch preview with an `AbortController` timeout of 10 seconds. Render a retry button for `failed`; render the exact spec messages for terminal states. In `ready`, render Recommendation details, signed images, masked contact copy, and the fixed form.

Use the storage key `mywisata.vendor-invite-draft`. Store `{ token, values, dirtyFields }`; restore only when the saved token equals the URL token. Never overwrite a dirty field when a refreshed authenticated preview unlocks full contact values.

- [ ] **Step 5: Refactor the fixed form to accept defaults without adding fields**

```ts
export type VendorClaimValues = {
  businessName: string; legalBusinessName: string; businessType: string;
  contactEmail: string; contactPhone: string; businessAddress: string;
};

type VendorClaimFormProps = {
  token: string;
  initialValues: VendorClaimValues;
  authenticated: boolean;
  emailMatched: boolean;
  phoneVerified: boolean;
};
```

If signed out, submission saves the draft and redirects to `/login?next=${encodeURIComponent('/vendor-invite?recommendation=' + token)}`. If signed in with mismatched email, show `Sign in with the email address that received this invitation.` If phone is unverified, preserve the draft and show a verification action. Otherwise POST the existing six fields to `/api/vendor/claim`. Clear session storage only after HTTP 201.

- [ ] **Step 6: Run tests and commit**

Run: `npx vitest run app/vendor-invite/__tests__/page.test.tsx app/vendor/register/__tests__/page.spec.tsx app/api/vendor/claim/__tests__/route.test.ts`

Expected: PASS.

```bash
git add app/vendor-invite/page.tsx app/vendor-invite/__tests__/page.test.tsx components/vendor/vendor-invite-client.tsx components/vendor/vendor-claim-form.tsx app/vendor/register/__tests__/page.spec.tsx
git commit -m "feat: prefill public vendor invitation"
```

### Task 3: Authentication return and new invitation URL

**Files:**
- Modify: `app/login/page.tsx`
- Create: `app/login/__tests__/invite-return.test.ts`
- Modify: `app/api/admin/vendors/recommendation-invite/route.ts`
- Modify: `app/api/admin/vendors/recommendation-invite/__tests__/route.test.ts`
- Modify: `lib/email/__tests__/vendor-claim-invite.test.ts`

**Interfaces:**
- Consumes: validated `next` via `postLoginPath`/`safeNext` and invitation creation response.
- Produces: all sign-in, sign-up, email verification, demo-sign-in, and OAuth paths return to `/vendor-invite`; new emails contain `/vendor-invite?recommendation=`.

- [ ] **Step 1: Write failing return-path and email-link tests**

```ts
expect(loginSource).toContain('const nextPath = postLoginPath');
expect(loginSource).toContain('/auth/callback?next=');
expect(inviteRouteSource).toContain('/vendor-invite?recommendation=');
expect(inviteRouteSource).not.toContain('/vendor/register?recommendation=');
expect(inviteRouteSource).toContain("const claimUrl = `${origin}/vendor-invite?recommendation=");
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npx vitest run app/login/__tests__/invite-return.test.ts app/api/admin/vendors/recommendation-invite/__tests__/route.test.ts lib/email/__tests__/vendor-claim-invite.test.ts`

Expected: FAIL on the old `/vendor/register` URL and hard-coded post-sign-up destination.

- [ ] **Step 3: Centralize the validated next path in LoginPage**

Add a browser helper inside `LoginPage`:

```ts
function requestedNext() {
  return postLoginPath(new URLSearchParams(window.location.search).get('next'));
}
```

Use `requestedNext()` for demo sign-in, password sign-in, immediately confirmed sign-up, OTP verification, and Google OAuth. For callback flows, set `emailRedirectTo`/`redirectTo` to `${window.location.origin}/auth/callback?next=${encodeURIComponent(requestedNext() ?? '/customer/explore')}`. Continue relying on `safeNext` in the callback route.

- [ ] **Step 4: Generate only the public invitation URL**

Change the claim URL builder to:

```ts
const claimUrl = `${origin}/vendor-invite?recommendation=${encodeURIComponent(token)}`;
```

Update both fixed-template and AI-edited email tests. Do not change token generation, invite persistence, or the email body editor.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run app/login/__tests__/invite-return.test.ts app/api/admin/vendors/recommendation-invite/__tests__/route.test.ts lib/email/__tests__/vendor-claim-invite.test.ts`

Expected: PASS.

```bash
git add app/login/page.tsx app/login/__tests__/invite-return.test.ts app/api/admin/vendors/recommendation-invite/route.ts app/api/admin/vendors/recommendation-invite/__tests__/route.test.ts lib/email/__tests__/vendor-claim-invite.test.ts
git commit -m "fix: preserve vendor invitation through authentication"
```

### Task 4: Privacy, regression, and browser verification

**Files:**
- Modify only if a failing verification proves a defect in Tasks 1–3.
- Test: all Task 1–3 tests plus existing Vendor claim and recommendation detail privacy tests.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: verified public invitation flow with no private evidence leak.

- [ ] **Step 1: Run the focused automated suite**

Run:

```bash
npx vitest run \
  lib/recommendations/__tests__/vendor-invite-preview.test.ts \
  app/api/vendor-invite/preview/__tests__/route.test.ts \
  app/vendor-invite/__tests__/page.test.tsx \
  app/vendor/register/__tests__/page.spec.tsx \
  app/api/vendor/claim/__tests__/route.test.ts \
  app/login/__tests__/invite-return.test.ts \
  app/api/admin/vendors/recommendation-invite/__tests__/route.test.ts \
  lib/email/__tests__/vendor-claim-invite.test.ts \
  app/api/admin/recommendations/__tests__/detail.route.test.ts
```

Expected: all pass with zero failures.

- [ ] **Step 2: Run compiler and lint**

Run:

```bash
npx tsc --noEmit --incremental false
npm run lint -- app/vendor-invite app/api/vendor-invite components/vendor/vendor-invite-client.tsx components/vendor/vendor-claim-form.tsx lib/recommendations/vendor-invite-preview.ts app/login/page.tsx app/api/admin/vendors/recommendation-invite/route.ts
```

Expected: exit 0 with no lint errors.

- [ ] **Step 3: Delegate one bounded read-only privacy review to `luna_worker`**

Ask it to verify only: raw token is never logged/persisted outside the existing hashed invite; anonymous DTO excludes unmasked contacts/recommender identity/raw storage paths; matching-email enforcement exists at preview and claim boundaries; other `/vendor/*` routes remain protected. It must not edit files or expand scope.

- [ ] **Step 4: Verify in two Playwright browser contexts**

Use a signed-out context to open a fresh emailed `/vendor-invite` link and assert safe summary, masked contacts, editable safe defaults, and sign-in redirect with preserved `next`. Use a separate matching-email authenticated context to assert full contacts, restored edits, phone gate, successful Vendor Draft submission, and single-use rejection on replay. Never paste the raw token into logs or screenshots.

- [ ] **Step 5: Commit only verification-driven fixes, if any**

If no files changed, do not create an empty commit. If verification reveals a defect, add the narrow regression test first, apply the smallest fix, rerun Steps 1–4, then commit only those files:

```bash
git add app/api/vendor-invite/preview/route.ts app/api/vendor-invite/preview/__tests__/route.test.ts app/vendor-invite/__tests__/page.test.tsx components/vendor/vendor-invite-client.tsx components/vendor/vendor-claim-form.tsx
git commit -m "fix: close vendor invite verification gap"
```

## Final acceptance checklist

- A signed-out email recipient reaches `/vendor-invite` without the Vendor portal layout.
- Safe evidence renders without revealing recommender identity or private contact values.
- The six fixed fields are pre-filled according to the approved mapping and remain editable.
- Authentication and phone verification preserve the invite token and Vendor edits.
- A matching email unlocks full contacts; mismatched email cannot preview or claim private data.
- Successful submission creates the private Vendor Draft once and leaves recommendation evidence unchanged.
- New emails use `/vendor-invite`; old `/vendor/register` links are not generated.
- No unrelated Vendor portal, Admin review, reward, or public-profile behavior changes.
