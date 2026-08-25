# Recommendation Vendor Claim Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an approved recommendation produce a truthful vendor invitation, an administrable pending vendor claim, and an atomic vendor-approval/recommendation-conversion result.

**Architecture:** Keep the existing Admin Recommendation detail and Admin Vendor Approval surfaces. Add one timestamped Supabase migration that deploys the guided 11-parameter claim RPC and an atomic approval RPC; route code becomes a thin authorization, validation, audit, and notification layer around those boundaries. Invitation delivery remains synchronous, but failed delivery cancels the new token and never reports success.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase/PostgreSQL PL/pgSQL, Vitest, React 19, i18next.

## Global Constraints

- Work on `feature/governance-wallet-recommendation-hardening`; do not create another branch.
- Apply only `supabase/migrations/20260826024400_recommendation_vendor_claim_closure.sql`; do not replay unmatched numeric migrations or run a blind database push.
- Recommendation review/invitation authority remains `admin` and `super_admin`; wallet-only `approver` must not gain recommendation authority.
- Ordinary non-recommendation vendor approval retains its current `super_admin`/`approver` authorization.
- Reuse the existing Admin page skeleton and modal; no layout redesign.
- No new npm dependencies.
- Use test-first RED → GREEN cycles and commit the completed implementation to the current branch.

---

## File Map

**Create**

- `supabase/migrations/20260826024400_recommendation_vendor_claim_closure.sql` — remote-safe claim signature plus atomic approval/conversion transaction.
- `supabase/migrations/__tests__/20260826024400_recommendation_vendor_claim_closure.test.ts` — SQL contract, authorization, atomicity, and grants.
- `app/api/admin/vendors/[id]/approve/__tests__/route.test.ts` — approve-route RPC and error behavior.
- `components/admin/__tests__/ai-draft-email-modal.contract.test.ts` — response metadata handoff contract.

**Modify**

- `app/api/admin/vendors/recommendation-invite/route.ts` — capability gate, truthful delivery lifecycle, cancellation, and status synchronization result.
- `app/api/admin/vendors/recommendation-invite/__tests__/route.test.ts` — delivery ordering and failure cases.
- `app/api/admin/vendors/recommendation-invite/draft/route.ts` — recommendation-domain capability gate.
- `app/api/admin/vendors/recommendation-invite/draft/__tests__/route.test.ts` — role-matrix expectations.
- `components/admin/ai-draft-email-modal.tsx` — pass successful response data to the caller.
- `components/admin/recommendation-detail-view.tsx` — show an invite-sent warning when status synchronization failed.
- `app/i18n/locales/en/admin.json`, `app/i18n/locales/zh-CN/admin.json`, `app/i18n/locales/ms/admin.json` — one localized synchronization-warning message.
- `app/api/admin/vendors/[id]/approve/route.ts` — use the atomic approval RPC for `approve`; preserve reject/request-information branches.

**Explicitly not modified**

- Wallet, withdrawal, Stripe, top-up, payout, and ledger code.
- Customer recommendation submission and status pages.
- Vendor claim request payload/UI (`app/api/vendor/claim/route.ts` and vendor invite wizard), because they already use the intended 11-parameter contract.
- Admin layout/navigation/page-shell components.
- Existing legacy migration files, conversion function, reward amount, and reward-clearance rules.
- Vendor rejection, request-information, suspension, and approval-email behavior.

## Scope, Database, Dependencies, and Risks

- **Database:** one additive migration; it replaces the claim function signature, creates/replaces one approval RPC, and changes no table shape or user data.
- **Dependencies:** none.
- **Primary risk:** an email can be delivered while the final recommendation status sync fails. The link remains valid; the UI must warn instead of inviting a duplicate blindly.
- **Authorization risk:** the old vendor route and old invitation guard use role names with different meanings. SQL remains the final authority: claimed-vendor conversion requires `can_review_recommendation`, while ordinary vendor approval retains `is_admin` legacy behavior.
- **Atomicity risk:** a nested conversion/reward error must roll back the vendor status/profile/role grant. The function must not catch and suppress conversion errors.
- **Deployment risk:** linked migration history differs from old local numeric files. Apply the exact timestamped file with `supabase migration up --linked --include-all` only after confirming the pending list contains this file and no unexpected migration; otherwise use the linked SQL execution path for this file alone.

---

### Task 1: Add the timestamped database contract

**Files:**

- Create: `supabase/migrations/__tests__/20260826024400_recommendation_vendor_claim_closure.test.ts`
- Create: `supabase/migrations/20260826024400_recommendation_vendor_claim_closure.sql`

**Interfaces:**

- Produces: `claim_vendor_recommendation(TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION) RETURNS JSONB`.
- Produces: `admin_approve_claimed_vendor(p_vendor_id UUID) RETURNS JSONB` with `{vendor_id, status, converted, recommendation_id, conversion_id}`.
- Consumes: `is_admin(UUID)`, `can_review_recommendation(UUID)`, and `convert_claimed_vendor_recommendation(UUID, UUID)`.

- [ ] **Step 1: Write a failing migration contract test**

Assert that the new SQL file exists and contains:

```ts
expect(sql).toContain('CREATE OR REPLACE FUNCTION public.claim_vendor_recommendation(');
expect(sql).toContain('p_category_id UUID');
expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_approve_claimed_vendor(');
expect(sql).toContain('IF v_claim_recommendation_id IS NOT NULL THEN');
expect(sql).toContain('public.convert_claimed_vendor_recommendation(');
expect(sql).toMatch(/UPDATE public\.vendors[\s\S]*?public\.convert_claimed_vendor_recommendation/);
expect(sql).toContain('INSERT INTO public.user_roles');
expect(sql).toContain('WHERE NOT EXISTS');
expect(sql).toContain('REVOKE ALL ON FUNCTION public.admin_approve_claimed_vendor(UUID) FROM PUBLIC, anon');
expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.admin_approve_claimed_vendor(UUID) TO authenticated, service_role');
```

Also assert the role boundary explicitly:

```ts
expect(sql).toContain('public.is_admin(v_actor_id)');
expect(sql).toContain('public.can_review_recommendation(v_actor_id)');
expect(sql).toContain("IF v_claim_recommendation_id IS NULL AND NOT public.is_admin(v_actor_id) THEN");
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
npx vitest run supabase/migrations/__tests__/20260826024400_recommendation_vendor_claim_closure.test.ts
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Implement the migration**

Copy the already-reviewed guided claim implementation from `095_recommendation_guided_vendor_claim.sql` into the new timestamped migration so the linked database receives the 11-parameter signature. Preserve token hash checks, per-user advisory lock, invite/recommendation row locks, email match, phone verification, pending vendor, submitted profile, inactive/pending-review outlet, claim row, and status changes.

Add the atomic function with this transaction shape:

```sql
CREATE OR REPLACE FUNCTION public.admin_approve_claimed_vendor(p_vendor_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_vendor public.vendors%ROWTYPE;
  v_claim_recommendation_id UUID;
  v_owner_role_id INTEGER;
  v_conversion_id UUID;
BEGIN
  IF v_actor_id IS NULL OR NOT (
    public.is_admin(v_actor_id)
    OR public.can_review_recommendation(v_actor_id)
  ) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  SELECT * INTO v_vendor
    FROM public.vendors
   WHERE id = p_vendor_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'vendor_not_found'; END IF;
  IF v_vendor.status NOT IN ('pending', 'rejected') THEN
    RAISE EXCEPTION 'vendor_not_approvable';
  END IF;

  SELECT recommendation_id INTO v_claim_recommendation_id
    FROM public.vendor_recommendation_claims
   WHERE vendor_id = p_vendor_id
   FOR UPDATE;

  IF v_claim_recommendation_id IS NULL AND NOT public.is_admin(v_actor_id) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  UPDATE public.vendors
     SET status = 'approved', approved_by = v_actor_id, approved_at = NOW(), rejection_reason = NULL
   WHERE id = p_vendor_id;

  INSERT INTO public.vendor_onboarding_profiles (
    vendor_id, status, review_note, reviewed_by, reviewed_at, updated_at
  ) VALUES (
    p_vendor_id, 'approved', NULL, v_actor_id, NOW(), NOW()
  ) ON CONFLICT (vendor_id) DO UPDATE SET
    status = EXCLUDED.status,
    review_note = NULL,
    reviewed_by = EXCLUDED.reviewed_by,
    reviewed_at = EXCLUDED.reviewed_at,
    updated_at = EXCLUDED.updated_at;

  SELECT id INTO v_owner_role_id FROM public.roles WHERE name = 'vendor_owner';
  IF v_owner_role_id IS NULL THEN RAISE EXCEPTION 'vendor_owner_role_missing'; END IF;

  INSERT INTO public.user_roles (user_id, role_id, vendor_id, outlet_id)
  SELECT v_vendor.owner_id, v_owner_role_id, p_vendor_id, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = v_vendor.owner_id
       AND role_id = v_owner_role_id
       AND vendor_id = p_vendor_id
       AND outlet_id IS NULL
  );

  IF v_claim_recommendation_id IS NOT NULL THEN
    v_conversion_id := public.convert_claimed_vendor_recommendation(
      p_vendor_id, v_claim_recommendation_id
    );
  END IF;

  RETURN jsonb_build_object(
    'vendor_id', p_vendor_id,
    'status', 'approved',
    'converted', v_claim_recommendation_id IS NOT NULL,
    'recommendation_id', v_claim_recommendation_id,
    'conversion_id', v_conversion_id
  );
END;
$$;
```

End with exact revoke/grant statements for both RPCs.

- [ ] **Step 4: Run the migration contract tests and verify GREEN**

Run:

```bash
npx vitest run supabase/migrations/__tests__/20260826024400_recommendation_vendor_claim_closure.test.ts supabase/migrations/__tests__/095_recommendation_guided_vendor_claim.test.ts app/api/vendor/claim/__tests__/route.test.ts
```

Expected: all tests PASS.

---

### Task 2: Make invitation delivery truthful and domain-authorized

**Files:**

- Modify: `app/api/admin/vendors/recommendation-invite/__tests__/route.test.ts`
- Modify: `app/api/admin/vendors/recommendation-invite/route.ts`
- Modify: `app/api/admin/vendors/recommendation-invite/draft/__tests__/route.test.ts`
- Modify: `app/api/admin/vendors/recommendation-invite/draft/route.ts`

**Interfaces:**

- Consumes: `db.rpc('can_review_recommendation', { uid: user.id })`.
- Produces on success: `{id, expires_at, claimUrl, emailSent: true, statusSynced: boolean}`.
- Produces on delivery failure: HTTP 502 `EMAIL_DELIVERY_FAILED` after updating the new invite to `cancelled`.

- [ ] **Step 1: Add failing route tests**

Add tests proving:

```ts
expect(mocks.rpc).toHaveBeenCalledWith('can_review_recommendation', { uid: 'admin-1' });
expect(statusUpdateOrder).toEqual(['insert-invite', 'send-email', 'mark-invited']);
expect(failedResponse.status).toBe(502);
expect(cancelUpdate).toHaveBeenCalledWith({ status: 'cancelled' });
expect(recommendationUpdate).not.toHaveBeenCalled();
expect(await failedResponse.json()).toMatchObject({
  error: { code: 'EMAIL_DELIVERY_FAILED' },
});
```

For the draft route, replace the stale `isSuperAdminOrApprover` expectation with `can_review_recommendation`; explicitly deny a false capability result.

- [ ] **Step 2: Run both route tests and verify RED**

Run:

```bash
npx vitest run app/api/admin/vendors/recommendation-invite/__tests__/route.test.ts app/api/admin/vendors/recommendation-invite/draft/__tests__/route.test.ts
```

Expected: FAIL because the current route updates status before sending and suppresses delivery errors.

- [ ] **Step 3: Implement the minimal lifecycle fix**

Replace the role-name helper with:

```ts
const { data: canReview, error: capabilityError } = await db.rpc(
  'can_review_recommendation',
  { uid: user.id },
);
if (capabilityError || canReview !== true) {
  return apiFail('FORBIDDEN', 'Recommendation reviewer role required', 403);
}
```

After inserting the invite, send/enqueue the email before updating the recommendation. On failure:

```ts
await service
  .from('vendor_recommendation_invites')
  .update({ status: 'cancelled' })
  .eq('id', data.id);
return apiFail('EMAIL_DELIVERY_FAILED', 'The vendor invitation email could not be sent', 502);
```

After confirmed delivery, update the recommendation. Return:

```ts
return apiOk(
  { ...data, claimUrl, emailSent: true, statusSynced: !statusError },
  { status: 201 },
);
```

Log `statusError` server-side without returning its database message. The claim link remains valid against an `approved` recommendation.

- [ ] **Step 4: Run both tests and verify GREEN**

Run the same focused Vitest command. Expected: PASS.

---

### Task 3: Surface post-send synchronization warnings

**Files:**

- Create: `components/admin/__tests__/ai-draft-email-modal.contract.test.ts`
- Modify: `components/admin/ai-draft-email-modal.tsx`
- Modify: `components/admin/recommendation-detail-view.tsx`
- Modify: `app/i18n/locales/en/admin.json`
- Modify: `app/i18n/locales/zh-CN/admin.json`
- Modify: `app/i18n/locales/ms/admin.json`

**Interfaces:**

- Produces: `onSent(id: string, data: unknown): void` from `AiDraftEmailModal`.
- Consumes recommendation invite response `{emailSent: true, statusSynced: boolean}`.

- [ ] **Step 1: Write a failing source contract test**

Read both component sources and assert:

```ts
expect(modalSource).toContain('onSent(target.id, responseBody.data)');
expect(detailSource).toContain('statusSynced');
expect(detailSource).toContain('recommendation.detail.feedback.inviteStatusSyncFailed');
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
npx vitest run components/admin/__tests__/ai-draft-email-modal.contract.test.ts
```

Expected: FAIL because response data is currently discarded.

- [ ] **Step 3: Pass response metadata and add localized warning**

Change the modal callback type to:

```ts
onSent: (id: string, data: unknown) => void;
```

Parse the successful envelope as `{data: unknown; error: {message: string} | null}` and call `onSent(target.id, responseBody.data)`.

In Recommendation detail, narrow the data safely:

```ts
onSent={(_id, responseData) => {
  const statusSynced = typeof responseData === 'object'
    && responseData !== null
    && 'statusSynced' in responseData
    && responseData.statusSynced === true;
  setInviteOpen(false);
  showFeedback(
    statusSynced ? 'success' : 'error',
    t(statusSynced
      ? 'recommendation.detail.feedback.inviteSent'
      : 'recommendation.detail.feedback.inviteStatusSyncFailed'),
  );
  void loadDetail();
}}
```

Add translations meaning “The invitation email was sent, but the recommendation status could not be synchronized. Refresh before sending another invite.” in English, Simplified Chinese, and Malay.

- [ ] **Step 4: Run focused UI/i18n tests and verify GREEN**

Run:

```bash
npx vitest run components/admin/__tests__/ai-draft-email-modal.contract.test.ts app/admin/__tests__/sitewide-i18n.contract.test.ts
```

Expected: PASS.

---

### Task 4: Route vendor approval through the atomic RPC

**Files:**

- Create: `app/api/admin/vendors/[id]/approve/__tests__/route.test.ts`
- Modify: `app/api/admin/vendors/[id]/approve/route.ts`

**Interfaces:**

- Consumes: `supabase.rpc('admin_approve_claimed_vendor', { p_vendor_id: vendorId })`.
- Consumes result: `{vendor_id, status, converted, recommendation_id, conversion_id}`.
- Produces API result: `{id, status, converted, recommendationId, conversionId}`.

- [ ] **Step 1: Write failing approve-route tests**

Test that approve:

```ts
expect(mocks.rpc).toHaveBeenCalledWith('admin_approve_claimed_vendor', {
  p_vendor_id: VENDOR_ID,
});
expect(mocks.vendorUpdate).not.toHaveBeenCalled();
expect(mocks.onboardingUpsert).not.toHaveBeenCalled();
expect(mocks.roleUpsert).not.toHaveBeenCalled();
```

Test that an RPC error returns no success/audit/notification, including:

```ts
mocks.rpc.mockResolvedValue({ data: null, error: { message: 'admin_required' } });
expect(response.status).toBe(403);
expect(mocks.auditAndNotify).not.toHaveBeenCalled();
expect(mocks.emitVendorNotification).not.toHaveBeenCalled();
```

Test that a converted result is exposed and audited with recommendation/conversion IDs.

- [ ] **Step 2: Run the route test and verify RED**

Run:

```bash
npx vitest run 'app/api/admin/vendors/[id]/approve/__tests__/route.test.ts'
```

Expected: FAIL because approve currently performs three separate writes.

- [ ] **Step 3: Implement the RPC route**

For `action === 'approve'`, call the RPC and map stable errors:

```ts
const { data: approval, error: approvalError } = await supabase.rpc(
  'admin_approve_claimed_vendor',
  { p_vendor_id: vendorId },
);
if (approvalError) {
  if (approvalError.message.includes('admin_required')) {
    return apiFail('FORBIDDEN', 'Vendor approval role required', 403);
  }
  if (approvalError.message.includes('vendor_not_found')) {
    return apiFail('NOT_FOUND', 'Vendor not found', 404);
  }
  if (approvalError.message.includes('vendor_not_approvable')) {
    return apiFail('INVALID_STATE', 'Vendor is not pending approval', 409);
  }
  return apiFail('RPC_ERROR', 'Vendor approval could not be completed', 500);
}
```

Delete only the approve branch’s direct vendor/profile/role writes. Keep existing audit and vendor notification calls after RPC success, adding conversion identifiers to audit `afterData`. Preserve request-information and reject code.

The route-level role gate may admit `admin` to reach this RPC only for the approve action; SQL determines whether the target is a claimed vendor. Existing ordinary-vendor approval remains limited to legacy `is_admin` (`super_admin`/`approver`) inside SQL.

- [ ] **Step 4: Run route and notification tests and verify GREEN**

Run:

```bash
npx vitest run 'app/api/admin/vendors/[id]/approve/__tests__/route.test.ts' lib/vendor-notifications/__tests__/event-matrix.test.ts
```

Expected: PASS.

---

### Task 5: Focused verification, migration deployment, and remote probes

**Files:**

- Modify only if a confirmed must-fix failure is found in an in-scope file.

**Interfaces:**

- Verifies the local code and linked Supabase project expose the same RPC contracts.

- [ ] **Step 1: Run all affected tests**

```bash
npx vitest run \
  supabase/migrations/__tests__/20260826024400_recommendation_vendor_claim_closure.test.ts \
  supabase/migrations/__tests__/095_recommendation_guided_vendor_claim.test.ts \
  app/api/vendor/claim/__tests__/route.test.ts \
  app/api/admin/vendors/recommendation-invite/__tests__/route.test.ts \
  app/api/admin/vendors/recommendation-invite/draft/__tests__/route.test.ts \
  components/admin/__tests__/ai-draft-email-modal.contract.test.ts \
  'app/api/admin/vendors/[id]/approve/__tests__/route.test.ts' \
  lib/vendor-notifications/__tests__/event-matrix.test.ts \
  app/admin/__tests__/sitewide-i18n.contract.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run static verification once**

```bash
npm run lint
npx tsc --noEmit
```

Expected: exit code 0. If the repository has unrelated pre-existing failures, record them separately and run file-scoped verification for every changed TypeScript file.

- [ ] **Step 3: Inspect linked migration status before applying**

```bash
npx supabase migration list
```

Expected: `20260826024400` is local-only and no unexpected earlier timestamped migration is pending. Do not proceed if additional pending migrations appear.

- [ ] **Step 4: Apply only the new migration**

Use the Supabase CLI’s linked migration command only after Step 3 proves the pending set is exact. If the CLI attempts to replay old numeric migrations, stop and execute the contents of `20260826024400_recommendation_vendor_claim_closure.sql` through the linked project’s SQL execution mechanism instead.

Expected: migration succeeds once and appears in remote migration history.

- [ ] **Step 5: Probe remote RPC signatures safely**

Using the configured linked project URL and a non-user/service diagnostic client, call both RPC names with dummy UUID/input values and no authenticated user context.

Expected:

- `claim_vendor_recommendation` returns `not_authenticated`, not `PGRST202`.
- `admin_approve_claimed_vendor` returns `admin_required`, not `PGRST202`.
- No vendor, claim, invite, role, conversion, or reward row is created.

- [ ] **Step 6: Perform one focused security/privacy review**

Verify that raw invite tokens are absent from database writes/logs, provider errors are not returned to the browser, `approver` cannot invoke claimed-recommendation conversion, and failure paths do not expose internal SQL details.

- [ ] **Step 7: Commit implementation**

```bash
git add app components lib supabase/migrations
git commit -m "fix(recommendations): close vendor claim approval flow"
```

Expected: one implementation commit on the current branch; documentation commit remains separate.
