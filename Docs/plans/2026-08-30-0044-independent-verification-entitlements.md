# Independent Verification Entitlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status (2026-08-30):** Entitlement and Profile-fact repairs implemented and locally verified. A further UX simplification is approved in design and awaiting implementation review: make the existing Profile editor the single Account destination, add only Phone/KYC status cards above its stepper, and retire the duplicate intent-card hub through a compatibility redirect. The effective Profile fact already requires its historical completion timestamp plus current Identity, Photo, About you, and Preferences evidence across application and database authorization boundaries. Historical completion timestamps are preserved; Phone and KYC remain independent and untouched. Disposable-local pgTAP execution remains environment-blocked because Docker/Podman is unavailable; no linked, shared, or remote database was reset or migrated.

**Goal:** Replace the linear customer tier authorization model with independent Phone, Profile, and KYC facts plus dynamic, versioned entitlements that preserve every accepted feature rule and cannot bypass hard security guards.

**Architecture:** Existing verification columns remain the authoritative facts. A stable capability catalog, immutable policy versions, structured AND/OR requirements, assignments, and a default-deny evaluator produce named decisions for the frontend and API; database RPCs, RLS, triggers, and transactional checks independently enforce hard guards. Customer verification becomes three parallel paths, while Super Admin manages capabilities, policies, assignments, and the read-only global Audit Log inside one Access Control module.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase PostgreSQL/RLS/RPC, React, TailwindCSS, i18next, Vitest.

## Global Constraints

- Phone, Profile, and KYC can be completed in any order and must not mutate one another's verification facts.
- Profile Complete contains only Identity, Photo, About you, and Preferences; reuse their existing components, fields, validation, persistence, and styling.
- Reuse the exact current `Have a business to share?` visual component and the existing `CustomerPageTitle` / `CustomerPageShell` skeleton.
- Email + KYC Approved without Phone/Profile grants recommendation submission, Full Affiliate, commission earning, and withdrawal request, but never booking, purchase, checkout, or basic AI.
- Admin policies and assignments may add restrictions but may never bypass Email, Phone, KYC, ownership, account, payout, balance, cooldown, or withdrawal-approval hard guards.
- Every capability and policy failure is default-deny; the browser never supplies trusted capability, fact, assignment, tier, or policy-version claims.
- `users.tier` remains for compatibility in the first release but is not read for authorization.
- Historical applied migrations are not edited. The uncommitted `20260829203000_progressive_verification_db_guards.sql` must be corrected before deployment because it belongs to this unfinished branch.
- Catalogue Review remains separate from Access Control; Catalogue decisions continue to appear in the global Audit Log.
- No new npm dependency. Use the existing Supabase client, UI primitives, page shells, filters, pagination, i18n runtime, and `audit_logs` protection.
- Preserve unrelated dirty-worktree changes. Do not rename, move, reformat, or refactor unrelated files.
- New and modified customer/Admin copy must exist in English, Malay, and Simplified Chinese.

## Scope boundaries

**In scope:** capability contract, dynamic policy schema/evaluator/governance, auth snapshot, independent verification transitions, affected protected APIs and SQL boundaries, customer verification entry and recovery UX, Super Admin Access Control, global Audit Log, migrations, tests, translations, and the existing plan status.

**Not touched:** OTP provider mechanics, avatar storage protocol, bio moderation policy, KYC OCR/document privacy model, payout provider integration, Stripe webhook mechanics, Catalogue Review UI/API, customer navigation outside the Verification destination, unrelated Admin pages, product/catalogue schema, and historical applied migration contents.

## Database changes

- New tables: `capabilities`, `entitlement_policies`, `entitlement_policy_versions`, `entitlement_policy_requirements`, `entitlement_policy_approvals`, `entitlement_assignments`, and a singleton entitlement generation record.
- New governed functions for fact lookup, hard-guard evaluation, effective capability resolution, policy version creation/approval/activation/rollback, and assignment grant/deny/revoke.
- Forward rewrites of Profile completion, KYC submission/approval, recommendation, affiliate, commission clearing, and withdrawal hard guards.
- Existing `audit_logs` remains the immutable evidence store; no parallel audit table.
- Existing verification columns remain; no destructive tier-column removal.

## New dependencies

None.

---

### Task 1: Independent fact and capability domain contract

**Files:**
- Create: `lib/entitlements/types.ts`
- Create: `lib/entitlements/facts.ts`
- Create: `lib/entitlements/evaluator.ts`
- Create: `lib/entitlements/__tests__/evaluator.test.ts`
- Modify: `lib/auth/customer-capabilities.ts`
- Modify: `lib/auth/__tests__/customer-capabilities.test.ts`
- Modify: `lib/constants.ts`

**Interfaces:**
- Produces: `CapabilityKey`, `VerificationFacts`, `QualificationPath`, `EntitlementBlockerCode`, `EntitlementDecision`, `PolicyMatch`, `evaluateEntitlementDecision()`.
- Consumes: existing customer role and account-status strings; no database client.
- Later tasks must import capability keys and decisions from this task rather than define local strings.

- [ ] **Step 1: Write the failing independent-combination tests**

```ts
const emailKycOnly: VerificationFacts = {
  emailVerified: true,
  phoneVerified: false,
  profileComplete: false,
  kycStatus: "approved",
  accountStatus: "active",
  roles: ["customer"],
};

expect(evaluateEntitlementDecision(emailKycOnly, "recommendation.submit", allowPolicy)).toMatchObject({ allowed: true });
expect(evaluateEntitlementDecision(emailKycOnly, "affiliate.full", allowPolicy)).toMatchObject({ allowed: true });
expect(evaluateEntitlementDecision(emailKycOnly, "wallet.request_withdrawal", allowPolicy)).toMatchObject({ allowed: true });
expect(evaluateEntitlementDecision(emailKycOnly, "commerce.checkout", allowPolicy)).toMatchObject({
  allowed: false,
  blockerCode: "PHONE_VERIFICATION_REQUIRED",
});
```

- [ ] **Step 2: Run the tests and confirm the tier-based resolver fails the new matrix**

Run: `npx vitest run lib/entitlements/__tests__/evaluator.test.ts lib/auth/__tests__/customer-capabilities.test.ts`

Expected: FAIL because the new fact types/evaluator do not exist and the current resolver treats KYC as a cumulative tier.

- [ ] **Step 3: Define stable keys and fact-based decisions**

```ts
export type CapabilityKey =
  | "platform.browse"
  | "commerce.booking"
  | "commerce.purchase"
  | "commerce.checkout"
  | "ai.basic_recommendation"
  | "recommendation.submit"
  | "affiliate.limited"
  | "affiliate.full"
  | "affiliate.earn_commission"
  | "wallet.request_withdrawal"
  | "wallet.approve_withdrawal";

export type VerificationFacts = {
  emailVerified: boolean;
  phoneVerified: boolean;
  profileComplete: boolean;
  kycStatus: "unverified" | "pending" | "approved" | "rejected";
  accountStatus: "active" | "suspended" | "deleted";
  roles: readonly string[];
};

export type QualificationPath = {
  type: "email" | "phone" | "profile" | "kyc";
  href: string;
};

export type EntitlementBlockerCode =
  | "EMAIL_VERIFICATION_REQUIRED"
  | "PHONE_VERIFICATION_REQUIRED"
  | "PROFILE_OR_KYC_REQUIRED"
  | "PROFILE_REQUIRED"
  | "KYC_REQUIRED"
  | "KYC_PENDING"
  | "KYC_RESUBMISSION_REQUIRED"
  | "ENTITLEMENT_DENIED"
  | "ACCOUNT_RESTRICTED"
  | "POLICY_UNAVAILABLE";

export type EntitlementDecision = {
  capability: CapabilityKey;
  allowed: boolean;
  blockerCode: EntitlementBlockerCode | null;
  qualificationPaths: QualificationPath[];
  entitlementGeneration: number;
  source: "hard_guard" | "policy" | "assignment" | "default_deny" | null;
};
```

Implement `hardGuardDecision(facts, capability)` with explicit predicates from the approved spec. Implement `evaluateEntitlementDecision(facts, capability, match)` with precedence: account restriction, hard guard, explicit deny, active allow, default deny.

- [ ] **Step 4: Adapt the existing customer capability compatibility layer**

Keep existing customer-facing aliases temporarily, but map them to the stable keys:

```ts
export const CUSTOMER_CAPABILITY_KEY = {
  CHECKOUT: "commerce.checkout",
  BASIC_AI: "ai.basic_recommendation",
  RECOMMENDATION_SUBMIT: "recommendation.submit",
  AFFILIATE_LIMITED: "affiliate.limited",
  AFFILIATE_FULL: "affiliate.full",
  WITHDRAWAL: "wallet.request_withdrawal",
} as const satisfies Record<string, CapabilityKey>;
```

Delete tier-rank branching from `resolveCustomerCapability`. Its compatibility signature must accept `VerificationFacts`, not `verificationTier`.
Re-export or map `EntitlementBlockerCode` from the compatibility layer; `lib/entitlements/*` must not import from `lib/auth/*`.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run lib/entitlements/__tests__/evaluator.test.ts lib/auth/__tests__/customer-capabilities.test.ts`

Expected: PASS for Email-only, Phone-only, Profile-only, KYC-only, every two-fact combination, all-complete, account restriction, vendor affiliate restriction, pending KYC, rejected KYC, explicit deny, and default deny.

- [ ] **Step 6: Commit**

```bash
git add lib/entitlements lib/auth/customer-capabilities.ts lib/auth/__tests__/customer-capabilities.test.ts lib/constants.ts
git commit -m "feat: define independent entitlement decisions"
```

---

### Task 2: Versioned entitlement schema and seeded policies

**Files:**
- Create: `supabase/migrations/20260830010000_dynamic_entitlement_catalog.sql`
- Create: `supabase/migrations/__tests__/20260830010000_dynamic_entitlement_catalog.test.ts`
- Create: `lib/entitlements/__tests__/migration-contract.test.ts`

**Interfaces:**
- Produces database tables, constraints, indexes, seeded capability keys, seeded active policy versions, and `entitlement_generation`.
- Consumes exact `CapabilityKey` strings from Task 1.

- [ ] **Step 1: Write migration contract tests**

```ts
expect(sql).toContain("CREATE TABLE public.capabilities");
expect(sql).toContain("CREATE TABLE public.entitlement_policy_versions");
expect(sql).toContain("CREATE TABLE public.entitlement_policy_requirements");
expect(sql).toContain("CREATE TABLE public.entitlement_assignments");
expect(sql).toContain("UNIQUE (policy_id, version)");
expect(sql).toContain("CHECK (subject_type IN ('user','role','plan','partner'))");
expect(sql).toContain("affiliate.earn_commission");
expect(sql).not.toMatch(/EXECUTE\s+.+expected_value/i);
```

- [ ] **Step 2: Run the migration contract and confirm failure**

Run: `npx vitest run supabase/migrations/__tests__/20260830010000_dynamic_entitlement_catalog.test.ts lib/entitlements/__tests__/migration-contract.test.ts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create normalized, RLS-protected tables**

Implement the exact table family described by the spec. Use UUID primary keys, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, immutable policy-version rows after activation, partial unique indexes for one active version per policy and one live assignment per subject/capability/effect, foreign keys to `users` for actor columns, and CHECK constraints for every enum-like value.

Seed these keys exactly:

```sql
INSERT INTO public.capabilities(key, category, risk_level, customer_visible, manually_assignable)
VALUES
  ('platform.browse', 'platform', 'low', TRUE, FALSE),
  ('commerce.booking', 'commerce', 'medium', TRUE, TRUE),
  ('commerce.purchase', 'commerce', 'medium', TRUE, TRUE),
  ('commerce.checkout', 'commerce', 'high', TRUE, FALSE),
  ('ai.basic_recommendation', 'ai', 'low', TRUE, TRUE),
  ('recommendation.submit', 'recommendation', 'medium', TRUE, TRUE),
  ('affiliate.limited', 'affiliate', 'medium', TRUE, TRUE),
  ('affiliate.full', 'affiliate', 'high', TRUE, FALSE),
  ('affiliate.earn_commission', 'affiliate', 'high', TRUE, FALSE),
  ('wallet.request_withdrawal', 'wallet', 'critical', TRUE, FALSE),
  ('wallet.approve_withdrawal', 'wallet', 'critical', FALSE, FALSE);
```

Seed one active built-in allow policy per customer capability. `recommendation.submit` gets two alternative groups: Email + Profile and Email + approved KYC. `affiliate.limited` gets Email + Profile + KYC not approved. Full Affiliate, earning, and withdrawal get Email + approved KYC. Commerce and basic AI get Email + Phone.

- [ ] **Step 4: Add grants and RLS**

Browser roles receive no direct INSERT/UPDATE/DELETE on policy/governance tables. Super Admin reads and mutations go through governed RPCs created in Task 3. `capabilities` may be read by authenticated Super Admin APIs through service/server clients. `entitlement_assignments` is never customer-readable directly.

- [ ] **Step 5: Run static migration tests**

Run: `npx vitest run supabase/migrations/__tests__/20260830010000_dynamic_entitlement_catalog.test.ts lib/entitlements/__tests__/migration-contract.test.ts`

Expected: PASS and prove no executable Admin policy language is present.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260830010000_dynamic_entitlement_catalog.sql supabase/migrations/__tests__/20260830010000_dynamic_entitlement_catalog.test.ts lib/entitlements/__tests__/migration-contract.test.ts
git commit -m "feat: add versioned entitlement schema"
```

---

### Task 3: Governed policy evaluator and mutation RPCs

**Files:**
- Create: `supabase/migrations/20260830011000_entitlement_policy_governance.sql`
- Create: `supabase/migrations/__tests__/20260830011000_entitlement_policy_governance.test.ts`
- Create: `lib/entitlements/server.ts`
- Create: `lib/entitlements/admin.ts`
- Create: `lib/entitlements/__tests__/server.test.ts`
- Modify: `lib/audit.ts`

**Interfaces:**
- Produces: `resolveEffectiveCapability()`, `listAccessControlState()`, `createPolicyVersion()`, `approvePolicyVersion()`, `activatePolicyVersion()`, `setEntitlementAssignment()`.
- Produces SQL RPC `resolve_user_capability(UUID, TEXT)` returning `JSONB` with decision and generation.
- Consumes tables from Task 2 and types from Task 1.

- [ ] **Step 1: Write failing governance tests**

Test default deny, registered facts/operators only, AND/OR groups, explicit deny precedence, expired/revoked assignments, manual allow hard-guard preservation, creator/approver separation, immutable active versions, generation increment, and one audit event per mutation.

```ts
await expect(approvePolicyVersion({ versionId, actorId: creatorId })).rejects.toThrow("self_approval_forbidden");
mockResolveUserCapability("user-1", "wallet.request_withdrawal", { allowed: true });
expect(await resolveEffectiveCapability("user-1", "wallet.request_withdrawal")).toMatchObject({ allowed: true });
mockResolveUserCapability("user-2", "wallet.request_withdrawal", {
  allowed: false,
  blockerCode: "KYC_REQUIRED",
});
expect(await resolveEffectiveCapability("user-2", "wallet.request_withdrawal")).toMatchObject({
  allowed: false,
  blockerCode: "KYC_REQUIRED",
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx vitest run lib/entitlements/__tests__/server.test.ts supabase/migrations/__tests__/20260830011000_entitlement_policy_governance.test.ts`

Expected: FAIL because server helpers and governance RPCs do not exist.

- [ ] **Step 3: Implement database fact and hard-guard functions**

Create:

```sql
public.entitlement_fact_value(p_user_id UUID, p_fact_key TEXT) RETURNS JSONB
public.capability_hard_guard(p_user_id UUID, p_capability_key TEXT) RETURNS JSONB
public.resolve_user_capability(p_user_id UUID, p_capability_key TEXT) RETURNS JSONB
```

`entitlement_fact_value` supports only: `email_verified`, `phone_verified`, `profile_complete`, `kyc_status`, `account_status`, `role`, `plan`, and `partner`. Supported operators are `eq`, `not_eq`, and `contains`. Unknown keys/operators raise `policy_invalid` and the public resolver returns `POLICY_UNAVAILABLE` with `allowed=false`.

`resolve_user_capability` enforces precedence from the spec and never accepts a browser-provided fact value. A non-service authenticated caller may resolve only their own user ID; governed Admin APIs may use the service client after role checks.

- [ ] **Step 4: Implement governed policy and assignment RPCs**

Create exact RPCs:

```sql
create_entitlement_policy_version(p_policy_id UUID, p_effect TEXT, p_effective_from TIMESTAMPTZ, p_effective_until TIMESTAMPTZ, p_requirements JSONB, p_reason TEXT) RETURNS UUID
approve_entitlement_policy_version(p_version_id UUID, p_reason TEXT) RETURNS VOID
activate_entitlement_policy_version(p_version_id UUID, p_reason TEXT) RETURNS VOID
rollback_entitlement_policy(p_policy_id UUID, p_target_version INTEGER, p_reason TEXT) RETURNS UUID
set_entitlement_assignment(p_subject_type TEXT, p_subject_id TEXT, p_capability_key TEXT, p_effect TEXT, p_starts_at TIMESTAMPTZ, p_expires_at TIMESTAMPTZ, p_reason TEXT) RETURNS UUID
revoke_entitlement_assignment(p_assignment_id UUID, p_reason TEXT) RETURNS VOID
```

Every RPC verifies Super Admin authority, enforces reason length, prevents self-approval for high-risk capabilities, increments generation when effective state changes, and writes `audit_logs` with before/after data in the same transaction.

- [ ] **Step 5: Implement server adapters**

```ts
export async function resolveEffectiveCapability(
  userId: string,
  capability: CapabilityKey,
): Promise<EntitlementDecision>;

export async function createPolicyVersion(input: CreatePolicyVersionInput): Promise<string>;
export async function approvePolicyVersion(versionId: string, reason: string): Promise<void>;
export async function activatePolicyVersion(versionId: string, reason: string): Promise<void>;
export async function setEntitlementAssignment(input: AssignmentInput): Promise<string>;
```

Adapters parse RPC JSON through explicit TypeScript guards. Missing or malformed RPC data returns a fail-closed `POLICY_UNAVAILABLE` decision.

- [ ] **Step 6: Run governance tests**

Run: `npx vitest run lib/entitlements/__tests__/server.test.ts supabase/migrations/__tests__/20260830011000_entitlement_policy_governance.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260830011000_entitlement_policy_governance.sql supabase/migrations/__tests__/20260830011000_entitlement_policy_governance.test.ts lib/entitlements/server.ts lib/entitlements/admin.ts lib/entitlements/__tests__/server.test.ts lib/audit.ts
git commit -m "feat: govern entitlement policy decisions"
```

---

### Task 4: Server-authored capability snapshot and typed denial recovery

**Files:**
- Modify: `app/api/auth/me/route.ts`
- Modify: `app/api/auth/me/__tests__/route.test.ts`
- Modify: `lib/auth/customer-capabilities.server.ts`
- Modify: `lib/auth/customer-capability-error.ts`
- Modify: `lib/auth/__tests__/customer-capabilities-server.test.ts`
- Modify: `lib/auth/__tests__/customer-capability-error.test.ts`
- Modify: `components/providers/auth.tsx`
- Modify: `backend/core/types.ts`
- Modify: `components/customer/customer-capability-gate-dialog.tsx`
- Modify: `components/customer/use-customer-capability-gate.ts`
- Modify: `components/customer/__tests__/customer-capability-gate-dialog.test.tsx`

**Interfaces:**
- Produces auth payload `verificationFacts`, `capabilities`, and `entitlementGeneration`.
- Produces denial details with zero, one, or multiple `qualificationPaths`.
- Consumes the evaluator/server resolver from Tasks 1 and 3.

- [ ] **Step 1: Write failing auth and recovery contract tests**

```ts
expect(body.user.verificationFacts).toEqual({
  emailVerified: true,
  phoneVerified: false,
  profileComplete: false,
  kycStatus: "approved",
  accountStatus: "active",
  roles: ["customer"],
});
expect(body.user.capabilities["recommendation.submit"].allowed).toBe(true);
expect(body.user.capabilities["commerce.checkout"].blockerCode).toBe("PHONE_VERIFICATION_REQUIRED");
expect(parseCapabilityError(response)?.qualificationPaths).toHaveLength(2);
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx vitest run app/api/auth/me/__tests__/route.test.ts lib/auth/__tests__/customer-capabilities-server.test.ts lib/auth/__tests__/customer-capability-error.test.ts components/customer/__tests__/customer-capability-gate-dialog.test.tsx`

Expected: FAIL because the current server resolver consumes tier and the dialog supports one next action.

- [ ] **Step 3: Replace tier inputs with independent facts**

`/api/auth/me` reads `email_verified_at`, `phone_verified_at`, `profile_completed_at`, `kyc_status`, account status, roles, active assignments, and current generation. It may still return legacy `tier` for compatibility, but capability resolution never receives it.

Add to `User` and `AuthState`:

```ts
verificationFacts: VerificationFacts;
entitlementGeneration: number;
capabilities: Record<CapabilityKey, EntitlementDecision>;
```

- [ ] **Step 4: Implement multi-path typed denial handling**

`customerCapabilityFailure()` returns:

```ts
{
  capability,
  blockerCode,
  qualificationPaths,
  entitlementGeneration,
}
```

The gate dialog renders one CTA for Phone/KYC-only blockers and two CTAs for `PROFILE_OR_KYC_REQUIRED`. Every href passes through the existing safe-next sanitizer. API denials refresh `/api/auth/me` and reopen the same dialog.

- [ ] **Step 5: Run focused tests**

Run the command from Step 2.

Expected: PASS, including stale-generation recovery and unsafe external `next` rejection.

- [ ] **Step 6: Commit**

```bash
git add app/api/auth/me components/providers/auth.tsx backend/core/types.ts lib/auth components/customer/customer-capability-gate-dialog.tsx components/customer/use-customer-capability-gate.ts components/customer/__tests__/customer-capability-gate-dialog.test.tsx
git commit -m "feat: expose effective capability snapshots"
```

---

### Task 5: Independent Profile and KYC state transitions

**Files:**
- Create: `supabase/migrations/20260830012000_independent_verification_facts.sql`
- Create: `supabase/migrations/__tests__/20260830012000_independent_verification_facts.test.ts`
- Modify: `lib/verification/eligibility.ts`
- Modify: `lib/verification/__tests__/eligibility.test.ts`
- Modify: `lib/profile/profile-summary.ts`
- Modify: `app/api/profile/me/route.ts`
- Modify: `app/api/kyc/upload/route.ts`
- Modify: `app/api/kyc/upload/__tests__/route.test.ts`
- Modify: `app/api/admin/kyc/review/route.ts`
- Modify: `app/api/admin/kyc/review/__tests__/route.test.ts`

**Interfaces:**
- Produces `computeProfileVerification()` with four steps and independent `profile_completed_at`.
- Rewrites KYC begin/finalize/review functions so KYC requires neither Phone nor Profile.
- Consumes no entitlement assignment as proof; base authenticated eligibility and KYC document rules remain.

- [ ] **Step 1: Write failing lifecycle tests**

```ts
expect(computeProfileVerification({
  fullName: "A User",
  city: "George Town",
  country: "Malaysia",
  avatarUrl: "/avatars/u.webp",
  bio: "A sufficiently complete customer biography.",
  surveyComplete: true,
})).toMatchObject({ complete: true, completedSteps: ["identity", "avatar", "bio", "survey"] });

expect(kycUploadSql).not.toContain("profile_complete required");
expect(kycApprovalSql).not.toContain("tier_rank(tier)");
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npx vitest run lib/verification/__tests__/eligibility.test.ts app/api/kyc/upload/__tests__/route.test.ts app/api/admin/kyc/review/__tests__/route.test.ts supabase/migrations/__tests__/20260830012000_independent_verification_facts.test.ts`

Expected: FAIL because Phone remains a Profile step and KYC SQL remains sequential.

- [ ] **Step 3: Rewrite Profile completion forward-only**

Replace `promote_to_profile_complete(UUID)` in the new migration so it checks only full name, city, country, avatar, moderated bio, and a preference survey response. It sets `profile_completed_at` without requiring `phone_verified_at` and invokes a compatibility-tier recomputation that never treats KYC as Phone/Profile proof.

`computeProfileVerification()` accepts no `phoneVerified` input and returns four 25-point progress increments with step IDs `identity`, `avatar`, `bio`, `survey`. Replace the current five-step `ProfileCompletionPercentage` with `ProfileVerificationPercentage = 0 | 25 | 50 | 75 | 100`; do not reuse the old 20-point type.

- [ ] **Step 4: Rewrite KYC begin/finalize/approval forward-only**

Override the current deployed signatures for `begin_kyc_submission`, `finalize_kyc_submission`, and `promote_to_kyc_verified` / current review RPC. Preserve authentication, ownership, active-submission uniqueness, append-only review evidence, reviewer assignment, self-dealing prevention, OCR evidence, and storage-path validation. Remove only Phone/Profile/tier prerequisites. Approval sets `kyc_status='approved'` and keeps the approved `kyc_review_events.created_at` row as the approval-time evidence; do not add a duplicate `users.kyc_approved_at` column. It does not set Phone/Profile facts.

- [ ] **Step 5: Update route error mapping**

KYC upload no longer maps `tier_insufficient` to “Complete your profile.” It maps active submission, invalid evidence, document errors, and fail-closed server errors only. Admin review returns the current independent KYC outcome and does not report a synthetic post-review tier.

- [ ] **Step 6: Run lifecycle tests**

Run the command from Step 2.

Expected: PASS for KYC submission/approval from Email-only, Profile completion without Phone, and unchanged KYC security/privacy contracts.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260830012000_independent_verification_facts.sql supabase/migrations/__tests__/20260830012000_independent_verification_facts.test.ts lib/verification lib/profile/profile-summary.ts app/api/profile/me/route.ts app/api/kyc/upload app/api/admin/kyc/review
git commit -m "feat: make verification facts independent"
```

---

### Task 6: Customer verification entry and preserved four-step Profile UX

**Files:**
- Create: `app/customer/verification/page.tsx`
- Create: `app/customer/phone/page.tsx`
- Create: `components/profile/phone-verification-card.tsx`
- Create: `components/profile/business-share-banner.tsx`
- Create: `app/customer/verification/__tests__/page.contract.test.ts`
- Create: `app/customer/phone/__tests__/page.contract.test.ts`
- Modify: `app/customer/profile/page.tsx`
- Modify: `app/customer/profile/wizard-progress.ts`
- Modify: `app/customer/profile/__tests__/wizard-progress.test.ts`
- Modify: `app/customer/profile/__tests__/profile-completion.test.ts`
- Modify: `app/customer/kyc/page.tsx`
- Modify: `lib/customer/header-navigation.ts`
- Modify: `lib/customer/__tests__/header-navigation.test.ts`
- Modify: `app/customer/__tests__/sitewide-i18n.contract.test.ts`
- Modify: `app/i18n/locales/en/customer.json`
- Modify: `app/i18n/locales/ms/customer.json`
- Modify: `app/i18n/locales/zh-CN/customer.json`

**Interfaces:**
- Produces `/customer/verification`, `/customer/phone`, preserved `/customer/profile`, and direct `/customer/kyc` paths.
- Consumes capability snapshot and gate paths from Task 4.

- [ ] **Step 1: Write failing page-contract tests**

```ts
expect(verificationPage).toContain("CustomerPageTitle");
expect(verificationPage).toContain("BusinessShareBanner");
expect(verificationPage).toContain('"/customer/phone"');
expect(verificationPage).toContain('"/customer/profile"');
expect(verificationPage).toContain('"/customer/kyc"');
expect(profilePage).not.toContain("PhoneVerificationCard");
expect(WIZARD_STEPS.map((step) => step.id)).toEqual(["identity", "avatar", "bio", "survey"]);
```

- [ ] **Step 2: Run UI contracts and confirm failure**

Run: `npx vitest run app/customer/verification/__tests__/page.contract.test.ts app/customer/phone/__tests__/page.contract.test.ts app/customer/profile/__tests__/wizard-progress.test.ts app/customer/profile/__tests__/profile-completion.test.ts lib/customer/__tests__/header-navigation.test.ts`

Expected: FAIL because the new routes/components do not exist and Profile still contains Phone.

- [ ] **Step 3: Extract exact existing reusable components**

Move the current business banner JSX byte-for-byte in styling and copy bindings into `BusinessShareBanner`; render it from both Account Verification and Complete Profile. Move existing OTP form behavior into `PhoneVerificationCard` without changing provider calls, validation, rate limits, feedback, or field styling.

- [ ] **Step 4: Build the capability-first Account Verification page**

Use existing `CustomerPageTitle` and `CustomerPageShell wide className="pt-0 sm:pt-0"`. Render the confirmed capability-first rows:

```ts
const INTENTS = [
  { capability: "commerce.checkout", paths: ["/customer/phone"] },
  { capability: "recommendation.submit", paths: ["/customer/profile", "/customer/kyc"] },
  { capability: "affiliate.full", paths: ["/customer/profile", "/customer/kyc"] },
  { capability: "wallet.request_withdrawal", paths: ["/customer/kyc"] },
] as const;
```

Show independent Phone/Profile/KYC statuses and never label them Step 1/2/3.

- [ ] **Step 5: Preserve Profile and make it four steps**

Remove Phone state/handlers/markup from `app/customer/profile/page.tsx`. Keep Identity, Photo, About you, Preferences implementations unchanged. Keep the title, exact business banner, segmented progress, Step/Current/Next/percentage block, form cards, continuation, guest/loading/error states, and vendor-registration link. Update progress to 1–4 and 0/25/50/75/100.

- [ ] **Step 6: Make Phone and KYC direct paths**

`/customer/phone` renders `PhoneVerificationCard`, refreshes the auth snapshot on success, and returns to a sanitized `next`. KYC derives display/status from `kycStatus` and active submission, removes the linear tier list and Profile CTA prerequisite, and displays the submission form whenever base account rules and active-submission rules allow it.

- [ ] **Step 7: Update navigation and translations**

Point the existing Verification menu destination to `/customer/verification`. Add full English/Malay/Simplified Chinese copy for intent rows, independent statuses, qualification choices, policy denial, and Phone page. Keep existing Profile field copy unchanged.

- [ ] **Step 8: Run UI and i18n tests**

Run: `npx vitest run app/customer/verification/__tests__/page.contract.test.ts app/customer/phone/__tests__/page.contract.test.ts app/customer/profile/__tests__/wizard-progress.test.ts app/customer/profile/__tests__/profile-completion.test.ts lib/customer/__tests__/header-navigation.test.ts app/customer/__tests__/sitewide-i18n.contract.test.ts && npm run verify:i18n`

Expected: PASS with 100% locale key coverage.

- [ ] **Step 9: Commit**

```bash
git add app/customer/verification app/customer/phone app/customer/profile app/customer/kyc/page.tsx components/profile/phone-verification-card.tsx components/profile/business-share-banner.tsx lib/customer/header-navigation.ts lib/customer/__tests__/header-navigation.test.ts app/customer/__tests__/sitewide-i18n.contract.test.ts app/i18n/locales/*/customer.json
git commit -m "feat: add independent verification journeys"
```

---

### Task 7: Protected API parity and money/trust hard guards

**Files:**
- Modify: `app/api/checkout/prepare/route.ts`
- Modify: `app/api/stripe/create-order-checkout/route.ts`
- Modify: `app/api/stripe/create-checkout/route.ts`
- Modify: `app/api/dev/simulate-purchase/route.ts`
- Modify: `app/api/personalized-recommendations/route.ts`
- Modify: `app/api/recommendations/route.ts`
- Modify: `app/api/affiliate/link/route.ts`
- Modify: `app/api/stripe/connect-onboard/route.ts`
- Modify: `app/api/wallet/withdrawals/route.ts`
- Modify: `app/api/admin/affiliate/run-clearing/route.ts`
- Modify: `app/api/admin/clear-earnings/route.ts`
- Modify: `lib/wallet/customer-capabilities.ts`
- Modify: `lib/wallet/__tests__/customer-capabilities.test.ts`
- Modify: `app/api/checkout/__tests__/phone-verification.test.ts`
- Modify: `app/api/checkout/__tests__/simulator-prepare.test.ts`
- Modify: `app/api/stripe/create-order-checkout/__tests__/route.test.ts`
- Modify: `app/api/stripe/create-checkout/__tests__/route.test.ts`
- Modify: `app/api/personalized-recommendations/__tests__/route-contract.test.ts`
- Modify: `app/api/recommendations/__tests__/route.test.ts`
- Create: `app/api/affiliate/link/__tests__/route.test.ts`
- Modify: `app/api/stripe/connect-onboard/__tests__/route.test.ts`
- Modify: `app/api/wallet/withdrawals/__tests__/route.test.ts`
- Modify: `app/api/wallet/withdrawals/__tests__/destination-eligibility.test.ts`
- Create: `app/api/admin/affiliate/run-clearing/__tests__/route.test.ts`
- Create: `app/api/admin/clear-earnings/__tests__/route.test.ts`
- Modify: `supabase/migrations/20260829203000_progressive_verification_db_guards.sql`
- Create: `supabase/migrations/20260830013000_independent_capability_hard_guards.sql`
- Create: `supabase/migrations/__tests__/20260830013000_independent_capability_hard_guards.test.ts`

**Interfaces:**
- Every protected route consumes `resolveEffectiveCapability(userId, key)` and `customerCapabilityFailure()`.
- Database writes consume governed hard-guard functions and never trust route decisions.

- [ ] **Step 1: Write failing route and bypass tests**

Add the KYC-only scenario to recommendation, affiliate, commission, and withdrawal tests; add Phone-only checkout/basic-AI scenarios; assert no Phone requirement for withdrawal.

```ts
expect(await POST(withdrawalRequestFor({ phoneVerified: false, profileComplete: false, kycStatus: "approved" }))).toMatchObject({ status: 201 });
expect(await POST(checkoutRequestFor({ phoneVerified: false, kycStatus: "approved" }))).toMatchObject({ status: 403 });
expect(await POST(recommendationFor({ profileComplete: false, kycStatus: "approved" }))).toMatchObject({ status: 201 });
```

- [ ] **Step 2: Run the affected route suite and confirm failure**

Run:

```bash
npx vitest run app/api/checkout/__tests__/phone-verification.test.ts app/api/checkout/__tests__/simulator-prepare.test.ts app/api/stripe/create-order-checkout/__tests__/route.test.ts app/api/stripe/create-checkout/__tests__/route.test.ts app/api/personalized-recommendations/__tests__/route-contract.test.ts app/api/recommendations/__tests__/route.test.ts app/api/affiliate/link/__tests__/route.test.ts app/api/stripe/connect-onboard/__tests__/route.test.ts app/api/wallet/withdrawals/__tests__/route.test.ts app/api/wallet/withdrawals/__tests__/destination-eligibility.test.ts app/api/admin/affiliate/run-clearing/__tests__/route.test.ts app/api/admin/clear-earnings/__tests__/route.test.ts lib/wallet/__tests__/customer-capabilities.test.ts supabase/migrations/__tests__/20260830013000_independent_capability_hard_guards.test.ts
```

Expected: FAIL because tier and phone/profile prerequisites still conflict with the approved rules.

- [ ] **Step 3: Align application routes**

Map routes exactly:

```text
checkout/order/top-up purchase -> commerce.checkout or commerce.purchase
personalized recommendation generation -> ai.basic_recommendation
recommendation submission -> recommendation.submit
affiliate link -> affiliate.limited or affiliate.full, strongest effective mode
commission clearing -> affiliate.earn_commission
Connect onboarding and withdrawal request -> wallet.request_withdrawal followed by payout readiness
```

Remove phone from `deriveCustomerWalletCapabilities`. Keep minimum earnings, destination, cooldown, provider setup, conflicting request, and Admin approval behavior.

- [ ] **Step 4: Correct the unfinished earlier migration**

Because `20260829203000_progressive_verification_db_guards.sql` is uncommitted and not deployed, replace its tier/phone/profile assumptions with independent facts before it is ever applied. Preserve its confirmed bypass closures, grant revocations, append-only behavior, and service-role subject checks.

- [ ] **Step 5: Add the forward hard-guard migration**

`20260830013000_independent_capability_hard_guards.sql` must create/replace:

- order/booking triggers: verified Phone;
- recommendation trigger/RLS/RPC: Profile Complete OR KYC Approved;
- affiliate trigger/RLS/code generator: Profile Complete for Limited, KYC Approved for Full, vendor/outlet exclusion retained;
- commission clearing: KYC Approved, locks retained, Admin/service caller retained;
- withdrawal insert/request RPC: KYC Approved and financial readiness, no Phone/Profile/tier prerequisite;
- Admin withdrawal approval/completion: unchanged dual-control/state protections.

- [ ] **Step 6: Run route and migration tests**

Expected: all affected tests PASS and denied paths assert no side effects or external calls.

- [ ] **Step 7: Commit**

```bash
git add app/api/checkout app/api/stripe/create-order-checkout app/api/stripe/create-checkout app/api/dev/simulate-purchase app/api/personalized-recommendations app/api/recommendations app/api/affiliate/link app/api/stripe/connect-onboard app/api/wallet/withdrawals app/api/admin/affiliate/run-clearing app/api/admin/clear-earnings lib/wallet supabase/migrations/20260829203000_progressive_verification_db_guards.sql supabase/migrations/20260830013000_independent_capability_hard_guards.sql supabase/migrations/__tests__/20260830013000_independent_capability_hard_guards.test.ts
git commit -m "feat: enforce independent capability guards"
```

---

### Task 8: Super Admin Access Control APIs

**Files:**
- Create: `app/api/admin/access-control/overview/route.ts`
- Create: `app/api/admin/access-control/capabilities/route.ts`
- Create: `app/api/admin/access-control/policies/route.ts`
- Create: `app/api/admin/access-control/policies/[policyId]/versions/route.ts`
- Create: `app/api/admin/access-control/policies/versions/[versionId]/approve/route.ts`
- Create: `app/api/admin/access-control/policies/versions/[versionId]/activate/route.ts`
- Create: `app/api/admin/access-control/policies/[policyId]/rollback/route.ts`
- Create: `app/api/admin/access-control/assignments/route.ts`
- Create: `app/api/admin/access-control/assignments/[assignmentId]/revoke/route.ts`
- Create: `app/api/admin/access-control/audit-log/route.ts`
- Create: `app/api/admin/access-control/__tests__/routes.test.ts`
- Create: `lib/validation/entitlement-schemas.ts`
- Create: `lib/entitlements/admin-guard.ts`

**Interfaces:**
- Produces read/mutation APIs for the Access Control UI.
- Consumes governed server/RPC functions from Task 3.
- All mutation responses include `auditEventId` and current generation.

- [ ] **Step 1: Write failing authorization and mutation tests**

For every route, test unauthenticated, customer, Approver, Admin, and Super Admin. Only Super Admin may access the module. High-risk activation requires a different approved actor. Audit Log accepts only read filters and no mutation method.

- [ ] **Step 2: Run route tests and confirm failure**

Run: `npx vitest run app/api/admin/access-control/__tests__/routes.test.ts`

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Implement strict validation**

Create Zod schemas for capability metadata, immutable version input, normalized requirement groups, approval/activation/rollback reasons, assignment subject/effect/time range, revoke reason, and Audit filters. Reject unknown fact keys/operators before calling SQL.

- [ ] **Step 4: Implement Super Admin-only APIs**

Reuse one `requireAccessControlSuperAdmin()` helper that authenticates through Supabase and checks the `super_admin` role server-side. Never accept actor ID from the body. List APIs paginate and filter. Mutations delegate to governed RPCs and return stable conflict/forbidden/validation codes.

- [ ] **Step 5: Implement read-only Audit Log API**

Select from existing `audit_logs`, newest first, with filters for actor, action prefix, entity type, entity ID, capability/policy reference, date range, and trace reference. Implement `sanitizeAuditPayload()` with an explicit Access Control metadata allowlist: `capabilityKey`, `policyId`, `policyVersionId`, `assignmentId`, `subjectType`, `subjectId`, `effect`, `status`, `effectiveFrom`, `effectiveUntil`, `generation`, `traceReference`, and `reason`. Drop all other nested keys recursively; never expose KYC document paths, IC hashes, phone/email values, payout secrets, or provider credentials.

- [ ] **Step 6: Run API tests**

Run: `npx vitest run app/api/admin/access-control/__tests__/routes.test.ts`

Expected: PASS for role denial, self-approval denial, validation, pagination, audit correlation, and read-only behavior.

- [ ] **Step 7: Commit**

```bash
git add app/api/admin/access-control lib/validation/entitlement-schemas.ts lib/entitlements/admin-guard.ts
git commit -m "feat: add access control administration APIs"
```

---

### Task 9: Unified Access Control Admin module

**Files:**
- Create: `app/admin/access-control/page.tsx`
- Create: `app/admin/access-control/__tests__/page.contract.test.ts`
- Create: `components/admin/access-control/access-control-tabs.tsx`
- Create: `components/admin/access-control/overview-tab.tsx`
- Create: `components/admin/access-control/capabilities-tab.tsx`
- Create: `components/admin/access-control/policies-tab.tsx`
- Create: `components/admin/access-control/assignments-tab.tsx`
- Create: `components/admin/access-control/audit-log-tab.tsx`
- Create: `components/admin/access-control/types.ts`
- Create: `components/admin/access-control/__tests__/filtering.test.ts`
- Modify: `app/admin/layout.tsx`
- Modify: `app/admin/__tests__/layout.contract.test.ts`
- Modify: `app/admin/__tests__/page-shell-consistency.contract.test.ts`
- Modify: `app/admin/__tests__/filter-consistency.contract.test.ts`
- Modify: `app/admin/__tests__/sitewide-i18n.contract.test.ts`
- Modify: `app/i18n/locales/en/admin.json`
- Modify: `app/i18n/locales/ms/admin.json`
- Modify: `app/i18n/locales/zh-CN/admin.json`

**Interfaces:**
- Produces one Super Admin navigation destination with tabs: Overview, Capabilities, Policies, Assignments, Audit Log.
- Consumes Task 8 APIs and existing Admin primitives.

- [ ] **Step 1: Write failing UI contracts**

```ts
expect(adminLayout).toContain('href: "/admin/access-control"');
expect(adminLayout).toContain("superAdminOnly: true");
expect(page).toContain("AdminPageHeader");
expect(page).toContain("AccessControlTabs");
expect(tabs).toContain('"audit-log"');
expect(auditTab).not.toMatch(/method:\s*["'](?:POST|PATCH|DELETE)/);
```

- [ ] **Step 2: Run UI contracts and confirm failure**

Run: `npx vitest run app/admin/access-control app/admin/__tests__/layout.contract.test.ts app/admin/__tests__/page-shell-consistency.contract.test.ts app/admin/__tests__/filter-consistency.contract.test.ts app/admin/__tests__/sitewide-i18n.contract.test.ts components/admin/access-control`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add the unified navigation and shell**

Add one `Access Control` nav item, `superAdminOnly: true`. Use existing `AdminPageHeader`, filter bar, segmented filter, pagination, status badges, confirmation dialog, loading, error, and empty-state patterns. Do not add separate Entitlements and Audit Log sidebar entries.

- [ ] **Step 4: Implement the five tabs**

- Overview: active versions, pending approvals, expiring assignments, evaluator warnings.
- Capabilities: catalog metadata and enabled state; immutable keys.
- Policies: draft/version comparison, structured requirement groups, impact preview, approval, schedule, activation, retirement, rollback.
- Assignments: User/Role/Plan/Partner filters, allow/deny, effective period, reason, revoke.
- Audit Log: read-only global log with linked actor/action/target/before/after/policy version/trace reference.

Every successful mutable action displays a `View audit event` link selecting the corresponding Audit Log entry. Audit rows link back to capabilities, policies, or assignments where available.

- [ ] **Step 5: Add all three locale resources**

Add identical key trees for navigation, tabs, filters, forms, validation, confirmations, statuses, risk levels, success/error feedback, audit fields, empty states, and accessibility labels.

- [ ] **Step 6: Run Admin UI and i18n tests**

Run the command from Step 2, then `npm run verify:i18n`.

Expected: PASS with no new i18n coverage gap.

- [ ] **Step 7: Commit**

```bash
git add app/admin/access-control components/admin/access-control app/admin/layout.tsx app/admin/__tests__ app/i18n/locales/*/admin.json
git commit -m "feat: add unified access control console"
```

---

### Task 10: Shadow evaluation, migration safety, and audit correlation

**Files:**
- Create: `lib/entitlements/shadow-evaluation.ts`
- Create: `lib/entitlements/__tests__/shadow-evaluation.test.ts`
- Create: `app/api/admin/access-control/shadow-report/route.ts`
- Create: `app/api/admin/access-control/shadow-report/__tests__/route.test.ts`
- Create: `supabase/migrations/20260830014000_entitlement_audit_correlation.sql`
- Create: `supabase/migrations/__tests__/20260830014000_entitlement_audit_correlation.test.ts`
- Modify: `Docs/plans/2026-08-29-1956-progressive-verification-access-contract.md`

**Interfaces:**
- Produces a Super Admin-only comparison report and audit trace references.
- Consumes old compatibility decisions only for comparison; never as authorization after rollout.

- [ ] **Step 1: Write failing shadow and audit tests**

Test that accepted non-linear differences are classified as expected changes, unexpected denials/overgrants are blocking, sensitive facts are absent from telemetry, and every Access Control mutation carries one trace reference into `audit_logs`.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx vitest run lib/entitlements/__tests__/shadow-evaluation.test.ts app/api/admin/access-control/shadow-report/__tests__/route.test.ts supabase/migrations/__tests__/20260830014000_entitlement_audit_correlation.test.ts`

Expected: FAIL because shadow comparison and correlation fields/functions do not exist.

- [ ] **Step 3: Implement safe shadow comparison**

Compare stable capability outcomes only. Record user ID as a one-way hash, capability key, legacy outcome, entitlement outcome, expected-change classification, and generation. Do not record email, phone, profile fields, KYC evidence, assignment reason, or financial amounts.

- [ ] **Step 4: Add audit correlation forward-only**

Add non-secret trace/policy-version metadata to audit `after_data` or a narrowly scoped nullable column if existing JSON indexing is insufficient. Preserve append-only triggers and grants. Do not make Catalogue Review depend on the new metadata.

- [ ] **Step 5: Update the superseded linear plan**

Mark `Docs/plans/2026-08-29-1956-progressive-verification-access-contract.md` as superseded by this plan for authorization semantics. Preserve its completed research/history and state explicitly that the shared dialog/API-parity work is reused while cumulative tier ordering is not.

- [ ] **Step 6: Run focused tests**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/entitlements/shadow-evaluation.ts lib/entitlements/__tests__/shadow-evaluation.test.ts app/api/admin/access-control/shadow-report supabase/migrations/20260830014000_entitlement_audit_correlation.sql supabase/migrations/__tests__/20260830014000_entitlement_audit_correlation.test.ts Docs/plans/2026-08-29-1956-progressive-verification-access-contract.md
git commit -m "feat: add entitlement rollout safeguards"
```

---

### Task 11: End-to-end verification and handoff

**Files:**
- Modify only when a verification failure identifies a confirmed requirement violation in files already owned by Tasks 1–10.
- Create: `supabase/tests/independent_entitlement_matrix.sql`
- Test: all affected unit, route, migration-contract, i18n, and full Vitest suites.

**Interfaces:**
- Produces release evidence; no new feature interface.

- [x] **Step 1: Run formatting and static checks**

Run:

```bash
git diff --check
npm run lint
npx tsc --noEmit
npm run verify:i18n
```

Expected: every command exits 0. Existing warnings may be documented only if they predate this plan; no new warning is accepted in modified files.

- [x] **Step 2: Run affected entitlement and verification tests**

Run:

```bash
npx vitest run lib/entitlements/__tests__ lib/auth/__tests__/customer-capabilities.test.ts lib/auth/__tests__/customer-capabilities-server.test.ts lib/auth/__tests__/customer-capability-error.test.ts lib/verification/__tests__/eligibility.test.ts lib/wallet/__tests__/customer-capabilities.test.ts app/api/auth/me/__tests__/route.test.ts app/api/kyc/upload/__tests__/route.test.ts app/api/admin/kyc/review/__tests__/route.test.ts components/customer/__tests__/customer-capability-gate-dialog.test.tsx components/customer/__tests__/capability-surfaces.test.ts app/customer/verification/__tests__/page.contract.test.ts app/customer/phone/__tests__/page.contract.test.ts app/customer/profile/__tests__/wizard-progress.test.ts app/customer/profile/__tests__/profile-completion.test.ts lib/customer/__tests__/header-navigation.test.ts app/customer/__tests__/sitewide-i18n.contract.test.ts app/api/checkout/__tests__/phone-verification.test.ts app/api/checkout/__tests__/simulator-prepare.test.ts app/api/stripe/create-order-checkout/__tests__/route.test.ts app/api/stripe/create-checkout/__tests__/route.test.ts app/api/personalized-recommendations/__tests__/route-contract.test.ts app/api/recommendations/__tests__/route.test.ts app/api/affiliate/link/__tests__/route.test.ts app/api/affiliate/__tests__/customer-read-guards.test.ts app/api/stripe/connect-onboard/__tests__/route.test.ts app/api/wallet/withdrawals/__tests__/route.test.ts app/api/wallet/withdrawals/__tests__/destination-eligibility.test.ts app/api/admin/affiliate/run-clearing/__tests__/route.test.ts app/api/admin/clear-earnings/__tests__/route.test.ts app/api/admin/access-control/__tests__/routes.test.ts app/api/admin/access-control/shadow-report/__tests__/route.test.ts app/admin/access-control/__tests__/page.contract.test.ts app/admin/__tests__/layout.contract.test.ts app/admin/__tests__/page-shell-consistency.contract.test.ts app/admin/__tests__/filter-consistency.contract.test.ts app/admin/__tests__/sitewide-i18n.contract.test.ts components/admin/access-control/__tests__/filtering.test.ts supabase/migrations/__tests__/20260830010000_dynamic_entitlement_catalog.test.ts supabase/migrations/__tests__/20260830011000_entitlement_policy_governance.test.ts supabase/migrations/__tests__/20260830012000_independent_verification_facts.test.ts supabase/migrations/__tests__/20260830013000_independent_capability_hard_guards.test.ts supabase/migrations/__tests__/20260830014000_entitlement_audit_correlation.test.ts
```

Expected: all affected tests PASS, including the full independent-fact matrix, policy lifecycle, Admin authorization, direct-RPC bypass, denied-side-effect, customer UI, and Audit Log contracts.

- [x] **Step 3: Run the complete suite once after the final code change**

Run: `npm test`

Expected: all non-skipped tests PASS. Do not repeatedly rerun the broad suite unless a failure requires one repair and one fresh verification.

- [ ] **Step 4: Run a migration syntax check in an isolated local Supabase database** — PostgreSQL 17 parser check passed; disposable-local pgTAP execution is blocked until Docker Desktop or Podman is available.

Create `supabase/tests/independent_entitlement_matrix.sql` with pgTAP assertions for:

```text
Email + KYC only: recommendation/full affiliate/earn/withdrawal request allowed
Email + KYC only: booking/purchase/checkout/basic AI denied
Email + Profile only: recommendation/limited affiliate allowed
Email + Phone only: commerce/basic AI allowed
manual allow without hard guard: denied
high-risk self-approval: denied
audit update/delete: denied
```

Expected: migrations apply without syntax/signature errors and every assertion matches the approved matrix. Do not apply migrations to a shared or remote database during verification.

After `npx supabase status` confirms the local stack is running and shows only localhost service URLs, run exactly:

```bash
npx supabase db reset
npx supabase test db --file supabase/tests/independent_entitlement_matrix.sql
```

Stop and report a blocker instead of running either command if status points to a linked/shared environment or the local database is not disposable.

- [x] **Step 5: Perform one focused `luna_worker` permission/privacy review**

Ask the custom reviewer to inspect only: entitlement hard-guard bypasses, service-role subject checks, KYC/phone/profile non-equivalence, policy self-approval, audit immutability, sensitive fact exposure, and signed/storage-path exposure. Classify confirmed security/authorization/privacy violations as must-fix; record polish and speculative issues as follow-up. Allow one repair cycle and one focused re-review maximum.

- [x] **Step 6: Record release evidence and residual follow-ups**

Update this plan status to implemented and verified. Record command results, migration-local-only status, any pre-existing warnings, and non-blocking follow-ups. Do not claim remote deployment or migration application.

- [x] **Step 7: Commit the SQL matrix and verified plan status**

Any confirmed in-scope verification fix must be committed in its owning Task 1–10 file set before this step. Then run exactly:

```bash
git add supabase/tests/independent_entitlement_matrix.sql Docs/plans/2026-08-30-0044-independent-verification-entitlements.md
git commit -m "test: verify independent entitlement rollout"
```

## Risks

- A missed tier authorization read could overgrant capabilities when KYC is completed first; repository-wide tier usage must reach zero for protected decisions before rollout.
- A dynamic policy bug could affect many users; default deny, structured operators, immutable versions, impact preview, dual approval, generation invalidation, and shadow comparison are mandatory.
- Service-role code could bypass subject facts; money/trust mutations require database hard guards against the subject row.
- Policy/cache staleness could make UI misleading; sensitive mutations re-evaluate and frontend handles typed stale denials.
- Removing Phone from withdrawal readiness could accidentally weaken unrelated payout protections; only the Phone predicate is removed, while KYC, balance, destination, cooldown, provider, conflicting-request, and Admin approval checks remain.
- Reusing Profile UI while changing progress could regress step completion; the four existing sections and validations receive focused regression tests.
- Audit UI could expose private evidence; allowlisted projections must exclude document paths, IC hashes, phone values, payout credentials, and provider secrets.
- The working tree already contains unfinished changes from the earlier linear implementation; execution must adapt them in place and never discard unrelated user work.

## Verification summary

Evidence after the final code change (`bfbd6eb`):

- `git diff --check`, `npx tsc --noEmit`, and `npm run verify:i18n` exited 0. Malay and Simplified Chinese remain at 100% coverage (4471/4471 keys each).
- `npm run lint` exited 0 with 55 pre-existing warnings and no warnings in the final Affiliate repair file set.
- The affected entitlement/verification suite passed: 46 files, 475 tests.
- The full Vitest suite passed: 504 files passed, 7 skipped; 2345 tests passed, 20 skipped.
- PostgreSQL 17 parser validation passed for `supabase/tests/independent_entitlement_matrix.sql`; its pgTAP plan contains 11 assertions covering the approved independent-fact matrix, manual-allow hard guards, high-risk self-approval, and Audit Log immutability.
- `npx supabase status` confirmed the repository is linked to project `FYP`, but local container inspection failed because neither Docker nor Podman is installed. Therefore `supabase db reset` and `supabase test db` were intentionally not run; no remote/shared database was changed.
- The focused `luna_worker` review found three confirmed must-fix inconsistencies in `/api/auth/me` fact sourcing/default-deny behavior and server snapshot generation coherence. Those were repaired and re-reviewed. Its final Affiliate privacy review found and repaired direct stats/export/insight reads that lacked capability enforcement; focused re-review approved `bfbd6eb` with no remaining authorization, privacy, or core-rule blocker.
- Non-blocking follow-up: execute the committed pgTAP matrix on a disposable local Supabase stack once Docker Desktop or Podman is available, before any deployment or migration promotion.

---

### Follow-up repair: Profile entry and completion-fact consistency

**Context:** The Account menu still sends `Profile` directly to the four-step editor, so users do not see the independent Phone/Profile/KYC cards first. Browser verification also reproduced a fail-open data mismatch: a demo row with `profile_completed_at` set but missing Profile evidence renders `0% complete` in the editor while the verification snapshot and entitlement resolver treat Profile as complete.

**Files to modify:**

- `lib/customer/header-navigation.ts`
- `lib/customer/__tests__/header-navigation.test.ts`
- `app/i18n/locales/en/customer.json`
- `app/i18n/locales/ms/customer.json`
- `app/i18n/locales/zh-CN/customer.json`
- `app/api/auth/me/route.ts`
- `app/api/auth/me/__tests__/route.test.ts`
- `lib/profile/profile-summary.ts`
- `lib/profile/__tests__/profile-summary.test.ts`
- `supabase/seed.sql`
- `scripts/seed-remote-demo.mjs`
- this plan

**Files to create:**

- `supabase/migrations/20260830015000_profile_completion_consistency.sql`
- `supabase/migrations/__tests__/20260830015000_profile_completion_consistency.test.ts`

**Exact behavior:**

1. The first routing repair made the Account item `Profile & Verification`, routed it to `/customer/verification`, and removed the duplicate Verification item. The later approved UX follow-up below supersedes only that destination/layout decision.
2. Define one fail-closed database eligibility predicate matching Identity, uploaded Photo, 30–200 character About you, and non-empty Preferences evidence. Use it for the dynamic `profile_complete` fact, capability hard guard, recommendation insert guard, Affiliate mode, and compatibility metadata.
3. Preserve historical `profile_completed_at` evidence. Do not bulk-clear timestamps or mutate Phone/KYC facts; authorization uses the effective timestamp-plus-current-evidence predicate.
4. Make `/api/auth/me`, personalized recommendations, and the private Profile summary require both the stored completion timestamp and current four-section evidence, so application and database decisions cannot disagree.
5. Stop all demo seed paths from setting Profile completion without seeding the required evidence.

**Scope boundaries / files not touched:** No changes to the Profile editor layout, `BusinessShareBanner`, OTP provider, Phone/KYC flows, Profile field validation, avatar storage, bio moderation, Affiliate/Checkout rules, Admin pages, or historical applied migrations.

**Dependencies:** None.

**Database change:** One new forward migration; no destructive schema or data change. Historical completion timestamps, Phone facts, and KYC facts remain unchanged.

**Risks:** A predicate mismatch could revoke a valid Profile capability or leave an invalid one enabled. Contract tests compare every authorization boundary with the existing TypeScript rules, require default-avatar rejection and non-empty interests, and assert that the migration never clears historical Profile evidence or touches Phone/KYC. Local migration execution remains blocked until a disposable Docker/Podman-backed Supabase stack is available.

---

### Approved UX follow-up: integrate verification paths into Profile

**Context:** The independent verification hub correctly exposes Phone, Profile, and KYC, but its separate `What would you like to do?` intent cards duplicate the just-in-time capability dialogs. The selected visual target is the existing `/customer/profile` page. Users should keep that familiar four-step skeleton and see only the two other independent verification paths above it.

**Decision:** Use the existing Profile page as the single Account destination. Add two compact status cards—Phone and KYC—immediately after `BusinessShareBanner` and before the four-step progress bar. Do not show a Profile card because the user is already on the Profile editor. Do not show intent/feature cards. Capability-specific surfaces remain responsible for explaining what verification is missing when the user actually attempts Submit Recommendation, Affiliate, Checkout, or Withdrawal.

**Files to modify:**

- `app/customer/profile/page.tsx` — render the two-card row in both incomplete and completed Profile states.
- `app/customer/profile/__tests__/profile-completion.test.ts` — assert the preserved four-step skeleton and compact independent-path row.
- `components/profile/verification-path-cards.tsx` — new reusable presentation-only Phone/KYC status card row.
- `app/customer/verification/page.tsx` — replace the duplicate hub with a compatibility redirect to `/customer/profile`.
- `app/customer/verification/__tests__/page.contract.test.ts` — assert redirect behavior and absence of intent cards.
- `lib/customer/header-navigation.ts` — point the single `Profile & Verification` Account item to `/customer/profile`.
- `lib/customer/__tests__/header-navigation.test.ts` — assert one Profile destination and no separate verification destination.
- this plan.

**Exact UI behavior:**

1. Preserve `CustomerPageTitle`, `BusinessShareBanner`, Identity/Photo/About you/Preferences progress, all form fields, completion state, and continuation behavior.
2. Render Phone and KYC as equal-width cards on desktop and a one-column stack on narrow screens, using existing design tokens and Lucide icons already used by the project.
3. Each card shows its current state from `verificationFacts` and links directly to `/customer/phone` or `/customer/kyc`. Pending and rejected KYC remain visibly distinct through the existing localized state strings.
4. Keep the row visually compact and unheaded; include an accessible navigation label without adding visible explanatory copy.
5. `/customer/verification` redirects to `/customer/profile`, so bookmarks and older links do not break.
6. Remove the `What would you like to do?` intent-card experience entirely; no feature rule or backend entitlement changes.

**Files not touched:** Phone OTP UI/API, KYC UI/API, Profile section handlers and validation, Business banner styling, capability dialogs, recommendation/Affiliate/checkout/wallet APIs, database migrations, Admin pages, and entitlement rules.

**Dependencies:** None.

**Database changes:** None.

**Risks:** The two cards could crowd the Profile page on mobile or show stale state after verification. Responsive contract/browser checks must cover the stacked layout, and the cards must read only the existing `verificationFacts` snapshot refreshed by the Phone/KYC flows. The legacy redirect must not create a loop.

**Verification:** TDD contract tests, affected Profile/verification/navigation/i18n tests, TypeScript, scoped ESLint, browser inspection at desktop and narrow widths, and a screenshot comparison against the supplied Profile reference. Full Vitest runs once after the final code change.
