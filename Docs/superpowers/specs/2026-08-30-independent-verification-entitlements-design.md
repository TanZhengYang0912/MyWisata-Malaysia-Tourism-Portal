# Independent verification and dynamic entitlements design

**Status:** Approved design; implementation not started

**Date:** 2026-08-30

## Context

MyWisata currently represents customer verification as one cumulative tier:

`email_verified -> phone_verified -> profile_complete -> kyc_verified`

That representation conflicts with the accepted product rules. Phone, MyWisata
profile completion, and KYC are independent qualifications that customers may
complete in any order. Each qualification grants its own capability bundle:

- Phone verification grants commerce, checkout, and basic AI.
- Profile completion grants recommendation submission and Limited Affiliate.
- Approved KYC independently grants recommendation submission, Full Affiliate,
  commission earning, and withdrawal requests.
- KYC does not prove control of a phone number and does not prove that the
  MyWisata profile fields are complete.

A customer with verified email and approved KYC, but no verified phone and an
incomplete profile, is therefore a valid state. That customer may use the KYC
capability bundle but may not book, purchase, complete checkout, or use basic
AI. A single ordinal tier cannot represent that state safely.

The repository already stores the underlying facts separately through
`email_verified_at`, `phone_verified_at`, `profile_completed_at`, `kyc_status`,
account status, and roles. The implementation should reuse those facts and
retire tier rank as an authorization input.

Primary-source research supporting this model is recorded in
`Docs/research/2026-08-29-independent-verification-capability-models.md`.
Keycloak separates verified attributes and required actions; GitLab composes
named abilities from boolean predicates; Saleor uses granular permissions with
explicit alternative qualification paths; OpenID Connect defines email and
phone verification as separate claims.

## Accepted product rules

All authenticated customer capabilities assume a verified email and an active,
eligible account.

| Verified facts | Capabilities added |
|---|---|
| Email only | Sign in and browse |
| Phone | Booking, purchase, checkout, basic AI recommendation |
| Profile | Submit recommendation, generate Limited Affiliate link |
| KYC approved | Submit recommendation, Full Affiliate, earn commission, request withdrawal |

The resulting capability contract is a union of independently earned bundles.

| Capability | Authoritative predicate |
|---|---|
| `platform.browse` | Public browsing rules; authenticated browsing requires an eligible account |
| `commerce.booking` | `email_verified AND phone_verified` |
| `commerce.purchase` | `email_verified AND phone_verified` |
| `commerce.checkout` | `email_verified AND phone_verified` |
| `ai.basic_recommendation` | `email_verified AND phone_verified` |
| `recommendation.submit` | `email_verified AND (profile_complete OR kyc_approved)` |
| `affiliate.limited` | `email_verified AND profile_complete AND NOT kyc_approved` |
| `affiliate.full` | `email_verified AND kyc_approved` |
| `affiliate.earn_commission` | `email_verified AND kyc_approved` |
| `wallet.request_withdrawal` | `email_verified AND kyc_approved`, followed by wallet and payout readiness |
| `wallet.approve_withdrawal` | Authorized Admin and a valid withdrawal state; never granted by customer verification |

Affiliate mode is capability-specific precedence, not a global user tier:

```text
if kyc_approved: FULL
else if profile_complete: LIMITED
else: NONE
```

Withdrawal approval remains separate from withdrawal eligibility. Approved
KYC allows the customer to request a withdrawal after financial readiness
checks. Only an authorized Admin may approve or complete the withdrawal.

## Design decision

Adopt a dynamic entitlement system backed by independent verification facts,
with immutable hard security guards.

The system has two distinct layers:

1. **Dynamic entitlement policy** determines which capabilities are enabled by
   verification facts, roles, plans, partners, assignments, effective dates,
   and commercial configuration.
2. **Hard guards** enforce accepted identity, account, financial, ownership,
   and approval invariants. Dynamic policies and manual assignments may add
   restrictions but may never remove or bypass a hard guard.

The capability system is default-deny. The browser never supplies a tier,
capability boolean, policy result, or assignment as authorization proof.

## Verification facts

The existing user facts remain authoritative:

```text
email_verified_at
phone_verified_at
profile_completed_at
kyc_status
account status
roles
```

Profile completion is redefined to contain only the existing Profile sections:

1. Identity
2. Photo
3. About you
4. Preferences

Phone is not part of profile completion. The existing Identity, Photo, About
you, and Preferences components, fields, validation, persistence, and visual
design remain unchanged.

The profile completion mutation must set `profile_completed_at` when these four
sections satisfy their existing requirements, regardless of phone or KYC state.
KYC submission and approval must not require phone verification or profile
completion. Phone verification must not mutate profile or KYC facts.

## Legacy tier compatibility

The existing `users.tier` column remains temporarily for migration and legacy
display compatibility, but it is deprecated as an authorization source.

- New API, RLS, RPC, trigger, and frontend decisions must not use tier rank.
- Existing authorization reads of `tier` must be migrated to named
  capabilities or explicit independent facts.
- Independent verification status is displayed from its real fact, not from a
  tier label.
- During the compatibility period, any derived tier summary must fail closed:
  it must never imply Phone or Profile completion merely because KYC is
  approved.
- Removing the column is a later migration after repository-wide usage reaches
  zero; it is not required in the first release.

## Dynamic entitlement data model

### Capability catalog

`capabilities` stores stable identifiers shared by the frontend, API, policy
engine, and database enforcement:

```text
key
category
risk_level
customer_visible
manually_assignable
enabled
created_at
updated_at
```

Capability keys are immutable after creation. Disabling a capability is an
audited operation and causes default denial; it does not delete history.

### Policies and immutable versions

`entitlement_policies` is the stable logical policy record. Each change creates
an immutable `entitlement_policy_versions` row:

```text
entitlement_policies
- id
- key
- capability_key
- name
- scope
- created_at

entitlement_policy_versions
- id
- policy_id
- version
- status: draft | pending_approval | scheduled | active | retired
- effect: allow | deny
- effective_from
- effective_until
- created_by
- approved_by
- created_at
- activated_at
```

An active version is never edited. A change creates the next version. Rollback
activates a previously approved version and records a new audit event.

### Structured policy requirements

`entitlement_policy_requirements` stores a normalized condition model rather
than Admin-authored SQL, JavaScript, or another executable expression:

```text
policy_version_id
alternative_group
fact_key
operator
expected_value
```

Requirements within one `alternative_group` are combined with `AND`.
Alternative groups are combined with `OR`.

The evaluator accepts only a registered set of fact keys and operators. Unknown
facts, malformed values, missing policies, unavailable policy storage, and
evaluation errors fail closed.

### Assignments

`entitlement_assignments` supports large-project targeting without weakening
hard guards:

```text
id
subject_type: user | role | plan | partner
subject_id
capability_key
effect: allow | deny
starts_at
expires_at
reason
granted_by
revoked_by
revoked_at
created_at
```

- Only capabilities marked `manually_assignable` accept manual allow grants.
- Manual allow still passes every hard guard for the capability.
- Explicit deny may immediately disable an otherwise enabled capability.
- Expired and revoked assignments are retained for audit history.
- Grant, deny, revoke, and expiry transitions are auditable.

### Policy approval

Capabilities with identity, money, commission, or withdrawal impact are
high-risk. Publishing or rolling back their policies requires approval by a
second eligible Admin. The creator cannot approve their own version.

Policy publication validates that the version cannot remove the capability's
registered hard guard. Invalid high-risk policies cannot become active.

### Policy generation and caching

Every policy activation, rollback, assignment change, or capability disable
advances a global entitlement generation identifier.

- `/api/auth/me` returns the generation with the capability snapshot.
- Normal read-only UI decisions may use a short-lived snapshot.
- Policy changes invalidate cached snapshots.
- Sensitive mutation endpoints re-read current facts and entitlement state and
  do not trust a browser snapshot.
- Money mutations re-evaluate eligibility within the database transaction.

## Hard guards

Hard guards live in reviewed application code and database RPC, policy,
trigger, or constraint enforcement. They are not editable through the
Entitlements Admin UI.

| Capability or mutation | Non-bypassable guard |
|---|---|
| Booking, purchase, checkout, basic AI | Verified email, verified phone, active account, ownership where applicable |
| Submit recommendation | Verified email, active account, and Profile Complete or approved KYC |
| Limited Affiliate | Verified email, Profile Complete, eligible customer role |
| Full Affiliate and commission earning | Verified email, approved KYC, eligible customer role |
| Request withdrawal | Verified email, approved KYC, sufficient eligible balance, payout readiness, destination rules, cooldowns, no conflicting request |
| Clear pending commission | Approved KYC rechecked under transaction lock |
| Approve or complete withdrawal | Authorized Admin, valid request state, required approvals, idempotency and transaction checks |

Phone and Profile are not hard guards for KYC submission, KYC approval, Full
Affiliate, commission earning, or withdrawal request eligibility.

## Decision precedence

The resolver uses one deterministic order:

```text
1. Suspended, deleted, or globally ineligible account -> deny
2. Capability hard guard unmet -> deny
3. Applicable explicit deny assignment or policy -> deny
4. Applicable active allow policy or assignment -> allow
5. No matching entitlement -> default deny
```

The returned decision identifies the capability, outcome, stable blocker code,
qualification paths, and current entitlement generation. It does not expose
internal policy expressions, private KYC evidence, or security-sensitive
configuration.

## Backend and database enforcement

Each protected mutation follows the same flow:

1. Authenticate the caller.
2. Load current verification facts, roles, account restrictions, active policy
   versions, and assignments from trusted server-side state.
3. Resolve the named capability.
4. Return a stable denial envelope when blocked.
5. Execute the mutation through its authoritative RPC or database boundary.
6. Recheck hard guards at that boundary, including ownership and transaction
   state.
7. Record the mutation and its audit event atomically where the action is
   security- or money-sensitive.

Service-role usage does not waive the subject user's hard guard. A service may
act for a subject only through an explicitly authorized path, while the
database still checks the subject's facts.

For commission clearing and withdrawal, the transaction locks the relevant
user, KYC, attribution, wallet, destination, and withdrawal rows as required.
Eligibility and balances are re-read immediately before mutation.

## Capability snapshot and denial contract

The server-authored auth payload exposes named decisions for consistent UX.
The frontend does not reimplement the policy table.

Example denial:

```json
{
  "data": null,
  "error": {
    "code": "PROFILE_OR_KYC_REQUIRED",
    "message": "Complete your profile or KYC to submit a recommendation.",
    "details": {
      "capability": "recommendation.submit",
      "qualificationPaths": [
        { "type": "profile", "href": "/customer/profile" },
        { "type": "kyc", "href": "/customer/kyc" }
      ],
      "entitlementGeneration": 3
    }
  }
}
```

Stable blocker families include:

- `EMAIL_VERIFICATION_REQUIRED`
- `PHONE_VERIFICATION_REQUIRED`
- `PROFILE_OR_KYC_REQUIRED`
- `KYC_REQUIRED`
- `KYC_PENDING`
- `KYC_RESUBMISSION_REQUIRED`
- `ENTITLEMENT_DENIED`
- `ACCOUNT_RESTRICTED`
- `POLICY_UNAVAILABLE`

Wallet operational blockers such as minimum balance, payout destination,
provider setup, cooldown, and conflicting request remain separate and are
evaluated after the base withdrawal entitlement.

When multiple valid qualification paths exist, the shared gate dialog shows
all applicable paths. Checkout shows Phone only. Recommendation submission
shows Profile and KYC. Limited versus Full Affiliate explains the consequence
of each route. Withdrawal shows KYC only, followed by the next wallet blocker.

## Customer experience

### Account Verification entry

Add a capability-first Account Verification page using the existing unified
customer page skeleton:

- existing `CustomerPageTitle` and `CustomerPageShell` layout;
- `ACCOUNT` eyebrow, serif title, description rhythm, width, spacing, borders,
  radii, and design tokens;
- the existing `Have a business to share?` component is reused exactly,
  including its pale background, store icon, two-line copy, and right chevron;
- no duplicate local shell or new visual system.

The content asks what the customer wants to do:

- booking, purchase, checkout, or basic AI -> Phone;
- recommendation submission -> Profile or KYC;
- affiliate link -> Profile for Limited or KYC for Full;
- commission earning or withdrawal request -> KYC.

The page also summarizes the three independent statuses without presenting a
mandatory sequence.

### Phone

Phone uses an independent OTP route and the same customer page-shell tokens.
It does not route through Complete Profile. After successful verification it
refreshes capabilities and safely returns to the original attempted action.

### Profile

The current Complete Profile page skeleton remains. It retains:

- page title and description;
- exact existing `Have a business to share?` component;
- segmented progress bar;
- Step, Current, Next, and completion percentage summary;
- existing form cards and validation behavior.

The only flow change is removal of Phone. Progress becomes four steps:
Identity, Photo, About you, and Preferences. Those four implementations are
reused without redesign or unrelated refactoring.

### KYC

KYC retains the existing document, status, pending, rejection, resubmission,
and continuation experience. It removes Phone and Profile prerequisites.
Customers may open and submit KYC immediately after the base account
requirements. Approval grants the KYC capability bundle without mutating Phone
or Profile facts.

### Feature visibility

Gated features remain visible. Clicking a blocked action opens the shared
localized gate dialog. A stale frontend snapshot is expected: a typed API
denial refreshes the snapshot and opens the same recovery dialog.

## Super Admin Access Control module

Entitlements and audit history share one unified top-level module without
mixing mutable control data with immutable evidence:

```text
Super Admin -> Access Control
  Overview
  Capabilities
  Policies
  Assignments
  Audit Log
```

All tabs reuse the existing Admin page shell, header, filtering, pagination,
localization, and design tokens.

- **Overview** shows active policy health, pending high-risk approvals,
  assignments nearing expiry, and policy evaluation warnings.
- **Capabilities** manages the stable catalog and visibility metadata.
- **Policies** creates drafts, previews impact, obtains approval, schedules,
  publishes, retires, and rolls back immutable versions.
- **Assignments** manages User, Role, Plan, and Partner allow or deny records.
- **Audit Log** is read-only and displays the platform-wide append-only audit
  evidence with actor, action, target, before/after values, reason, timestamp,
  policy version, and trace reference.

Every successful Access Control mutation links to its audit event. Audit events
link back to the affected capability, policy, or assignment where it still
exists.

The Audit Log reuses the existing `audit_logs` table and append-only database
protection. It is not Catalogue Review. Catalogue Review remains the separate
Admin/Approver workflow for pending outlets, products, and vouchers. Catalogue
decisions continue to write their business-specific `content_reviews` row and
also appear in the global Audit Log.

Mutable Access Control APIs and read-only Audit Log APIs remain separate.
Audit events cannot be edited, deleted, or corrected in place.

## Testing strategy

### Verification and capability matrix

Tests must cover at least these valid non-linear states:

| Facts | Allowed | Blocked |
|---|---|---|
| Email only | Sign in, browse | Commerce, AI, recommendation, affiliate, withdrawal |
| Email + Phone | Commerce, checkout, basic AI | Recommendation, affiliate earnings, withdrawal |
| Email + Profile | Recommendation, Limited Affiliate | Phone-gated commerce/AI, Full Affiliate, withdrawal |
| Email + approved KYC | Recommendation, Full Affiliate, earn commission, withdrawal request | Phone-gated commerce/AI |
| Email + Phone + KYC; Profile incomplete | Phone and KYC bundles | Any future Profile-only data requirement |
| Email + Profile + KYC; Phone absent | Recommendation, Full Affiliate, earn commission, withdrawal request | Phone-gated commerce/AI |
| All complete | All corresponding customer capabilities | Withdrawal completion until Admin approval |

### Policy engine

Cover:

- AND conditions within a group and OR between alternative groups;
- active, draft, pending, scheduled, expired, retired, and rolled-back versions;
- explicit deny precedence;
- assignment scope, start, expiry, revoke, and subject matching;
- manual allow cannot bypass hard guards;
- unknown facts, invalid operators, unavailable policy storage, and malformed
  policy values fail closed;
- creator cannot approve their own high-risk policy;
- activation advances entitlement generation and invalidates caches;
- impact preview and active evaluation use the same evaluator.

### Frontend and API parity

Cover:

- `/api/auth/me` and protected APIs use the same capability keys and outcome
  contract;
- stale snapshots recover through the typed denial dialog;
- Profile-or-KYC decisions expose two safe continuation paths;
- unsafe external `next` values are rejected;
- Account Verification uses the unified customer skeleton and exact business
  banner component;
- Profile contains exactly the existing four sections after Phone removal;
- existing Identity, Photo, About you, and Preferences behavior regresses none;
- all new customer and Admin copy exists in English, Malay, and Simplified
  Chinese.

### Authorization and side effects

For each protected mutation, test unauthenticated, wrong-role, unqualified,
qualified, revoked, expired, and explicitly denied actors. A denied mutation
must not create or change orders, recommendations, affiliate links,
attributions, commission balances, wallet ledger entries, payout setup,
withdrawal requests, notifications, emails, or external calls.

Direct RPC, RLS, service-role, and alternate route paths must not bypass hard
guards. Money tests include transaction-lock and time-of-check/time-of-use
cases. Withdrawal request and Admin approval are tested as separate state
transitions.

### Audit

Cover:

- every Access Control mutation produces one correlated append-only audit
  event;
- before/after values, actor, reason, target, policy version, and trace
  reference are correct;
- Audit Log is read-only;
- attempts to update, delete, or truncate audit evidence fail;
- Catalogue Review remains separate while its decisions remain discoverable in
  the global Audit Log.

## Migration and rollout strategy

The implementation plan should order work by risk:

1. Add the capability catalog, versioned policy schema, assignments, approval,
   and audit integration without changing live authorization.
2. Seed policies representing the accepted rules and build the evaluator in
   shadow mode. Compare its decisions with current production decisions while
   explicitly accepting the new non-linear combinations.
3. Add the server snapshot and protected API decisions behind a controlled
   rollout flag.
4. Add forward-only database hard guards and remove sequential Phone/Profile/KYC
   prerequisites.
5. Migrate recommendation, affiliate, commission, withdrawal, commerce, and AI
   mutations to named capabilities.
6. Release the Account Verification entry, independent Phone/KYC routes, and
   four-step Profile flow.
7. Release the Super Admin Access Control module and read-only global Audit Log.
8. Remove remaining tier-based authorization reads after contract and bypass
   tests prove parity.

Historical migrations are not edited. All schema and enforcement changes use
forward-only migrations. Rollout preserves a fail-closed path when policy
evaluation is unavailable.

## Scope boundaries

- Do not redesign or rewrite Identity, Photo, About you, Preferences, KYC
  document handling, OTP mechanics, customer shell, Admin shell, or the exact
  existing `Have a business to share?` component.
- Do not merge Catalogue Review into Access Control or Audit Log.
- Do not allow Admin policies or assignments to bypass Email, Phone, KYC,
  ownership, account status, payout, balance, cooldown, or Admin approval hard
  guards.
- Do not remove the legacy tier column in the first release.
- Do not trust browser-supplied capabilities, tiers, policy versions, or
  assignments.
- Do not add an executable policy language.
- Do not refactor unrelated routes, components, or migrations.

## Risks and mitigations

- **Policy misconfiguration:** validate registered facts/operators, preview
  impact, require dual approval for high-risk versions, preserve hard guards,
  and default-deny on error.
- **Stale UI decisions:** return entitlement generation, invalidate snapshots,
  re-authorize mutations, and handle typed denials reactively.
- **Tier compatibility overgrant:** stop using tier for authorization before
  allowing non-linear states and keep any temporary summary fail-closed.
- **Service-role bypass:** enforce subject hard guards at the database mutation
  boundary.
- **TOCTOU in money flows:** lock and re-read KYC, attribution, wallet,
  destination, and withdrawal state inside the transaction.
- **Admin self-approval:** separate creator and approver for high-risk policy
  publication.
- **Audit tampering:** retain append-only triggers and grants; expose Audit Log
  as read-only.
- **UI regression:** reuse existing shells/components and add focused visual and
  contract regression tests instead of redesigning established screens.

## Success criteria

The design is successfully implemented when:

1. Phone, Profile, and KYC can be completed in any order.
2. Every valid fact combination receives exactly the accepted capability union.
3. Email + approved KYC, without Phone or Profile, can submit recommendations,
   use Full Affiliate, earn commission, and request withdrawal, while commerce,
   checkout, and basic AI remain blocked.
4. Profile completion excludes Phone and reuses the existing four section
   implementations and page skeleton.
5. Dynamic policies and assignments are versioned and auditable but cannot
   bypass hard guards.
6. Frontend snapshots, API denials, and database enforcement use stable named
   capabilities and remain consistent under stale state and direct-call tests.
7. Withdrawal requests still require financial readiness and completion still
   requires authorized Admin approval.
8. Super Admin manages Entitlements and reviews the global Audit Log inside one
   unified Access Control module with separate mutable and read-only boundaries.
