# Progressive Verification Access Contract

**Status:** Proposed — approved direction, awaiting written-spec review

**Created:** 2026-08-29 19:56 Asia/Kuala_Lumpur

**Objective:** Preserve the accepted customer verification ladder while making
every gated action visible, understandable, and consistently enforced by the
frontend, API, and database.

## Context

MyWisata already has the required cumulative ladder:

`email_unverified → email_verified → phone_verified → profile_complete → kyc_verified`

It also already has the correct feature thresholds in `lib/constants.ts` and
database enforcement around checkout, recommendations, affiliate links, and
withdrawals. The problem is contract drift and user experience:

- the frontend independently derives a simplified access decision from tier;
- APIs use several different blocker codes for the same requirement;
- SQL/RPC/RLS repeats the feature thresholds separately;
- some screens redirect silently, some hide the useful surface, and some show
  a generic error instead of the next required verification step;
- the Profile page looks like one mandatory five-step onboarding flow even
  when Checkout only requires phone verification.

This design follows the mature-project findings recorded in
`Docs/research/2026-08-29-progressive-verification-access-contracts.md`:
backend-computed capabilities for frontend UX, server re-authorization at the
mutation boundary, typed recovery errors, and action-triggered step-up.

## Existing implementation to reuse

- `lib/constants.ts`: authoritative TypeScript tier order and feature floors.
- `lib/auth/customer-capabilities.ts`: existing customer capability names and
  tier-based resolver.
- `components/customer/use-customer-capability-gate.ts`: existing safe
  continuation and action interception.
- `app/api/auth/me/route.ts`: existing authenticated identity, role, and tier
  payload.
- `app/customer/profile/page.tsx`: existing phone, identity, avatar, bio, and
  survey steps.
- `app/customer/kyc/page.tsx`: existing KYC submission and status flow.
- `lib/wallet/customer-capabilities.ts`: existing ordered withdrawal-readiness
  blockers after the base KYC gate.
- Existing route checks, RPC guards, order trigger, and affiliate RLS policy.

## Decisions

### 1. Preserve the accepted rules

No tier is removed, reordered, or weakened.

| Customer state | Allowed capabilities |
|---|---|
| Guest | Browse public customer surfaces; gated actions remain visible and lead to sign-in |
| Email verified | Sign in and browse; maintain account/profile data; may prepare a cart but cannot complete booking, purchase, or checkout |
| Phone verified | Booking, purchase, checkout, and basic AI recommendation |
| Profile complete | Submit recommendations and generate a limited affiliate link |
| KYC verified and approved | Full affiliate mode, clear eligible commission into earnings, and request withdrawal |
| Withdrawal submitted | No automatic payout entitlement; Admin approval remains mandatory |

Limited affiliate attribution keeps the current behavior: Profile Complete can
generate a capped trial link and accrue capped pending attribution, but the
money cannot clear into withdrawable earnings until KYC is approved.

### 2. Server-resolved capability snapshot

The server computes a capability snapshot from fresh user state. The frontend
consumes this result and does not reinterpret the tier ladder.

```ts
type CustomerCapabilityDecision = {
  allowed: boolean;
  blockerCode: CustomerCapabilityBlocker | null;
  currentTier: Tier | null;
  requiredTier: Tier | null;
  nextAction: CustomerCapabilityNextAction;
};

type CustomerCapabilitySnapshot = Record<
  CustomerCapability,
  CustomerCapabilityDecision
>;
```

Canonical blockers:

- `SIGN_IN_REQUIRED`
- `EMAIL_VERIFICATION_REQUIRED`
- `PHONE_VERIFICATION_REQUIRED`
- `PROFILE_COMPLETION_REQUIRED`
- `KYC_REQUIRED`
- `KYC_PENDING`
- `KYC_RESUBMISSION_REQUIRED`
- `VENDOR_AFFILIATE_INELIGIBLE`

Withdrawal-specific operational blockers such as payout destination, provider
setup, cooldown, minimum amount, and active request remain in
`lib/wallet/customer-capabilities.ts`; they are evaluated after the base
`WITHDRAWAL` capability is allowed.

### 3. Frontend check and API denial use the same recovery UX

A common capability-gate provider owns one dialog. Every gated action calls the
existing hook before mutation:

1. If allowed, continue with the action.
2. If blocked, keep the feature visible and open the dialog.
3. The dialog explains the exact blocker, what the verification unlocks, and
   offers **Not now** plus one precise CTA.
4. The CTA carries a safe `next` continuation and a non-authoritative
   `capability` intent.

If client state is stale and the API returns a capability blocker anyway, a
shared error parser refreshes the authenticated capability snapshot and opens
the same dialog. API messages are fallbacks; localized copy is selected by the
stable blocker code.

### 4. Intent-aware verification and continuation

The tier ladder remains cumulative, but the user is asked only for what the
requested action needs.

| Attempted action | Recovery flow | Completion behavior |
|---|---|---|
| Checkout / booking / purchase / basic AI | Phone verification | Refresh capability snapshot and return immediately to the original action; do not continue into identity/avatar/bio/survey |
| Submit recommendation | Remaining steps through Profile Complete | Refresh snapshot and return to the recommendation surface/form |
| Generate limited affiliate link | Remaining steps through Profile Complete | Refresh snapshot and return to the affiliate page |
| Full affiliate / clear commission | KYC submission or KYC status | Pending review returns to the affiliate page with status; approval is asynchronous |
| Withdraw | KYC first, then payout readiness | Return to Wallet and reveal the next concrete blocker; Admin approval remains after submission |

The optional Profile page may still display overall completion, but a
capability-triggered flow must not imply that unrelated later steps are needed
for the current action.

### 5. Stable API error envelope

Every capability denial uses the existing API envelope and adds stable details:

```json
{
  "data": null,
  "error": {
    "code": "PHONE_VERIFICATION_REQUIRED",
    "message": "Phone verification is required before checkout",
    "details": {
      "capability": "checkout",
      "currentTier": "email_verified",
      "requiredTier": "phone_verified",
      "nextAction": "verify_phone"
    }
  }
}
```

The API re-resolves the capability immediately before the protected action.
It never trusts a capability boolean sent by the browser.

### 6. Database remains the final boundary

Existing SQL/RPC/RLS enforcement remains authoritative against bypasses:

- order creation requires verified phone;
- recommendation submission requires Profile Complete;
- affiliate-link insertion requires Profile Complete and eligible account
  state;
- commission clearing requires approved KYC;
- withdrawal submission requires approved KYC and payout readiness.

No historical migration is edited. No schema change is required for this
design. Contract tests must cover the complete capability × tier matrix and
assert that API blockers match the database floor for each money or trust
mutation.

## Architecture and data flow

```text
Authenticated user state
        │
        ▼
Server capability resolver ──────► /api/auth/me capability snapshot
        │                                      │
        │                                      ▼
        │                           Frontend visible action + dialog
        │                                      │
        ▼                                      ▼
API require-capability check ◄──── protected action request
        │
        ▼
Existing RPC / RLS / trigger invariant
```

The server resolver is the shared application policy used by both the auth
payload and protected routes. The database is an independent lower-level
invariant, not a second frontend policy catalogue.

## Implementation phases

### Phase 1 — Canonical capability contract and server snapshot

**Create**

- `lib/auth/customer-capabilities.server.ts`
- `lib/auth/__tests__/customer-capabilities-server.test.ts`
- `app/api/auth/me/__tests__/route.test.ts`

**Modify**

- `lib/auth/customer-capabilities.ts`
  - add `CustomerCapabilityDecision`, canonical blocker/next-action types, and
    the structured pure resolver;
  - retain a small compatibility wrapper only while call sites migrate.
- `lib/auth/__tests__/customer-capabilities.test.ts`
  - cover every capability at every tier, guest state, KYC pending/rejected,
    and safe continuations.
- `app/api/auth/me/route.ts`
  - return the server-resolved capability snapshot with the existing user and
    role payload.
- `components/providers/auth.tsx`
  - consume the server-authored user/capability payload and refresh it after a
    verification transition.
- `backend/core/types.ts`
  - expose the capability snapshot through `AuthContext` without making it a
    caller-controlled authorization claim.

### Phase 2 — Shared capability dialog and reactive error handling

**Create**

- `components/customer/customer-capability-gate-dialog.tsx`
- `components/customer/__tests__/customer-capability-gate-dialog.test.tsx`
- `lib/auth/customer-capability-error.ts`
- `lib/auth/__tests__/customer-capability-error.test.ts`

**Modify**

- `components/customer/use-customer-capability-gate.ts`
  - open the shared dialog instead of redirecting silently;
  - support both proactive decisions and parsed API denials.
- `app/customer/layout.tsx`
  - mount the gate provider once for all customer surfaces.
- `app/i18n/locales/en/customer.json`
- `app/i18n/locales/ms/customer.json`
- `app/i18n/locales/zh-CN/customer.json`
  - add localized blocker, explanation, cancel, CTA, pending, and resubmission
    copy.

### Phase 3 — Intent-aware profile and KYC recovery

**Modify**

- `app/customer/profile/page.tsx`
  - accept a safe capability intent;
  - stop at the required tier;
  - refresh capabilities and honor continuation after phone, profile, and
    survey completion.
- `app/customer/profile/wizard-progress.ts`
  - calculate progress for the active target without changing underlying
    completion requirements.
- `app/customer/profile/__tests__/profile-completion.test.ts`
- `app/customer/profile/__tests__/wizard-progress.test.ts`
  - cover phone-only and Profile Complete continuation paths.
- `app/customer/kyc/page.tsx`
  - honor safe continuation and distinguish required, pending, rejected, and
    approved states.

### Phase 4 — Align each customer surface

**Modify**

- `app/customer/checkout/page.tsx`
  - remove the mount-time silent redirect; show the surface/gate and check at
    the committing action.
- `app/customer/for-you/for-you-client.tsx`
  - use `BASIC_AI` proactively and map API phone blockers reactively.
- `app/customer/recommendations/page.tsx`
  - preserve the visible Submit action and return to it after Profile Complete.
- `app/customer/affiliate/page.tsx`
  - keep the limited-affiliate preview visible;
  - direct Profile-incomplete users to Profile, not KYC;
  - distinguish limited, KYC-pending, KYC-rejected, and full modes.
- `app/customer/wallet/page.tsx`
  - use the shared base withdrawal gate, then keep existing ordered payout
    readiness handling.

**Create or modify focused presentation tests**

- `components/customer/__tests__/for-you-layout.test.ts`
- `app/customer/checkout/__tests__/capability-gate.test.ts`
- `app/customer/affiliate/__tests__/capability-gate.test.ts`
- `app/customer/recommendations/__tests__/capability-gate.test.ts`

### Phase 5 — Normalize protected API routes

**Modify**

- `app/api/checkout/prepare/route.ts`
- `app/api/stripe/create-order-checkout/route.ts`
- `app/api/stripe/create-checkout/route.ts`
- `app/api/personalized-recommendations/route.ts`
- `app/api/recommendations/route.ts`
- `app/api/affiliate/link/route.ts`
- `app/api/stripe/connect-onboard/route.ts`
- `app/api/wallet/withdrawals/route.ts`

Each route uses the shared server resolver for its base capability and returns
the canonical error envelope. Domain-specific validation and transactional
logic stay in their current modules.

**Modify focused route tests**

- `app/api/checkout/__tests__/phone-verification.test.ts`
- `app/api/stripe/create-order-checkout/__tests__/route.test.ts`
- `app/api/personalized-recommendations/__tests__/route-contract.test.ts`
- `app/api/recommendations/__tests__/route.test.ts`
- `app/api/wallet/withdrawals/__tests__/route.test.ts`
- `app/api/wallet/withdrawals/__tests__/destination-eligibility.test.ts`

**Create**

- `app/api/affiliate/link/__tests__/route.test.ts`

## Scope boundaries

### Files and behavior explicitly not touched

- `lib/constants.ts` tier ordering and required-tier values, unless a type-only
  export is proven necessary;
- signup, email OTP, OAuth, and Supabase Auth reconciliation behavior;
- phone OTP provider, rate limits, and verified-phone uniqueness;
- Profile Complete field requirements or KYC approval requirements;
- affiliate rate calculation, caps, attribution, clearing, and fraud logic;
- wallet bucket arithmetic, ledger entries, payout provider integrations, and
  withdrawal Admin approval;
- vendor, outlet-manager, approver, and Admin authorization;
- guest/public route architecture;
- unrelated visual components, navigation, or design tokens;
- historical Supabase migration files.

### Dependencies

- **New npm dependencies:** none.
- Reuse the current dialog/button primitives, auth provider, translations,
  API envelope, Supabase clients, Vitest, and Playwright setup.

### Database changes

- **Schema changes:** none planned.
- **Data migrations/backfills:** none.
- Existing database invariants remain in place and are verified, not rewritten.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Capability snapshot becomes stale after verification | API always rechecks; successful transitions call `refreshUser`; reactive denial refreshes and reopens the same dialog |
| Redirect or continuation loop | Accept only safe local paths; return when the requested capability becomes allowed; never trust `capability` query input for authorization |
| Existing API consumers depend on `TIER_INSUFFICIENT` | Update focused call sites and tests in one phase; keep messages as fallback while codes migrate atomically |
| KYC approval is asynchronous | Use pending/rejected decisions rather than repeatedly sending users to submission |
| Withdrawal has more blockers than tier | Base capability dialog hands off to the existing ordered wallet-readiness contract |
| SQL and application floors drift later | Matrix tests cover every tier and affected database boundary; DB remains independently restrictive |
| Feature disappears for blocked users | Presentation tests assert the action stays visible and has an explanatory recovery path |

## Verification

### Focused automated verification

1. Capability matrix and error parsing:

   ```bash
   npx vitest run lib/auth/__tests__/customer-capabilities.test.ts lib/auth/__tests__/customer-capabilities-server.test.ts lib/auth/__tests__/customer-capability-error.test.ts
   ```

2. Auth payload, dialog, and intent-aware recovery:

   ```bash
   npx vitest run app/api/auth/me components/customer/__tests__/customer-capability-gate-dialog.test.tsx app/customer/profile
   ```

3. Gated APIs and customer surfaces:

   ```bash
   npx vitest run app/api/checkout app/api/stripe/create-order-checkout app/api/personalized-recommendations app/api/recommendations app/api/affiliate/link app/api/wallet/withdrawals app/customer/checkout app/customer/affiliate app/customer/recommendations
   ```

4. Existing database-contract tests for order, recommendation, affiliate, and
   withdrawal gates; run the live affiliate RLS verifier when a safe migrated
   test project is available.

### Project verification

After the final code change, run once:

```bash
npm run lint
npx tsc --noEmit
npx vitest run
```

### Manual customer journeys

1. Guest sees each feature and receives Sign In on action.
2. Email Verified enters Checkout, sees a phone-only explanation, verifies,
   and returns to Checkout without being forced through Profile Complete.
3. Phone Verified opens Basic AI successfully but receives Profile Complete
   recovery for Submit Recommendation and Limited Affiliate.
4. Profile Complete generates a limited link, sees capped pending attribution,
   and cannot withdraw.
5. KYC pending sees status rather than a resubmission loop.
6. KYC approved uses full affiliate mode and may request Withdrawal only after
   payout readiness; submitted Withdrawal remains pending Admin approval.
7. A deliberately stale frontend snapshot receives an API blocker and opens
   the same localized recovery dialog.

## Acceptance criteria

- The five-tier ladder and all current thresholds remain unchanged.
- Restricted features remain discoverable.
- Every blocked action explains the exact missing requirement before routing.
- Frontend proactive checks and API reactive denials produce the same dialog
  and next action.
- The frontend consumes a server-resolved capability snapshot.
- Every protected API rechecks fresh state and returns a canonical blocker.
- Existing RPC/RLS/trigger enforcement still blocks direct bypasses.
- Phone-only actions never force Profile Complete.
- KYC and Withdrawal status accurately represent asynchronous Admin review.
- No new dependency, unrelated refactor, or historical migration edit is
  introduced.
