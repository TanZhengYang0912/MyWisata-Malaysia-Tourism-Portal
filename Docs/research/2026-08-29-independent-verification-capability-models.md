# Independent verification facts and capability models

**Date:** 2026-08-29

**Status:** Research complete

**Scope:** Primary sources only: official project source code, official project
documentation, and identity specifications. This note is research and design
guidance only; it does not modify MyWisata code or the implementation plan.

## Question

How do mature systems let users complete email verification, phone verification,
profile completion, and identity/KYC verification independently while still
granting exactly the allowed features and rechecking sensitive mutations on the
backend?

## Conclusion

The mature pattern is not a single linear `tier` as the authorization source of
truth. It is:

1. Persist independent verification facts.
2. Derive named capabilities from explicit boolean predicates over those facts.
3. Expose the derived decisions to the frontend for consistent guidance.
4. Re-evaluate the predicates at every authoritative backend mutation, with a
   database guard for money and other bypass-sensitive writes.

A tier or progress label can remain as presentation, but it must not imply that
one proof automatically establishes unrelated proofs. In particular, approved
KYC proves only the identity claims and assurance recorded by the KYC process;
it does not, by itself, prove control of a phone number or completion of a
MyWisata profile.

## Evidence from mature projects

### 1. Keycloak: identity facts and required actions are separate from permissions

Keycloak's [`UserModel`](https://github.com/keycloak/keycloak/blob/main/server-spi/src/main/java/org/keycloak/models/UserModel.java)
stores several independent kinds of user state:

- `isEmailVerified()` / `setEmailVerified(...)` is a dedicated verification
  fact.
- `getAttributes()` and `getAttributeStream(...)` hold arbitrary user
  attributes.
- `getRequiredActionsStream()`, `addRequiredAction(...)`, and
  `removeRequiredAction(...)` manage a set of outstanding actions.

The model does not make email verification, attributes, and required actions
one ordinal value. Its representation code also serializes email verification,
required actions, and attributes separately in
[`ModelToRepresentation`](https://github.com/keycloak/keycloak/blob/main/server-spi-private/src/main/java/org/keycloak/models/utils/ModelToRepresentation.java).

Keycloak's official server guide describes `VerifyProfile` as a required action
that checks whether the profile complies with the configured profile schema and
only asks for missing or invalid attributes. That is progressive profile
validation, not evidence that unrelated contact channels were verified. See
[`Server Administration Guide — Enabling Progressive Profiling`](https://www.keycloak.org/docs/latest/server_admin/index.html#_user-profile-progressive-profiling).

For authorization, Keycloak protects resources and action-like scopes with
policies. A permission associates a resource/scope with policies, and policies
may use attributes, roles, context, or combinations. Aggregated policies are
explicitly supported rather than requiring one large rank comparison. See:

- [`Authorization Services terminology`](https://github.com/keycloak/keycloak/blob/main/docs/documentation/authorization_services/topics/auth-services-terminology.adoc)
- [`Authorization Services architecture`](https://github.com/keycloak/keycloak/blob/main/docs/documentation/authorization_services/topics/auth-services-architecture.adoc)
- [`Obtaining permissions`](https://github.com/keycloak/keycloak/blob/main/docs/documentation/authorization_services/topics/service-authorization-obtaining-permission.adoc)

The architecture names a Policy Decision Point and a Policy Enforcement Point.
The resource server asks for and enforces an authorization decision. Therefore,
client-visible permission information is not the enforcement boundary.

**Applicable lesson:** use separate MyWisata facts for phone, profile, and KYC.
Optional KYC should not be implemented as a required-action sequence whose
earlier steps must be cleared first. Map facts to action scopes/capabilities.

### 2. GitLab: abilities are explicit rules, not consequences of one rank

GitLab's DeclarativePolicy framework divides authorization into boolean
`conditions` and static combinations of conditions that `enable` or `prevent`
named abilities. An ability is allowed when at least one enabling rule applies
and no preventing rule applies. This directly supports alternatives such as:

```text
can_submit_recommendation = profile_complete OR kyc_approved
```

and conjunctions such as:

```text
can_checkout = email_verified AND phone_verified AND account_active
```

See the official [`DeclarativePolicy framework`](https://docs.gitlab.com/development/policies/).
GitLab's custom-role documentation also gives the concrete example of granting
`read code` and `admin merge requests` without granting `admin issues`, showing
that capability bundles need not be ordinal or all-or-nothing. See
[`Custom role development guidelines`](https://docs.gitlab.com/development/permissions/custom_roles/).

The runtime entry point
[`Ability.allowed?`](https://github.com/gitlabhq/gitlabhq/blob/master/app/models/ability.rb)
resolves the applicable policy and asks whether a specific ability is allowed.
It also warns that, if relevant facts change during a request, a later check
must bypass cached policy state (`cache: false`) so the ability is genuinely
re-evaluated.

GitLab's authorization guidance is explicit about frontend/backend parity:
display-layer checks are only for better UX, and the underlying backend must
also check the ability. By default, authorization happens at the endpoint; in
some cases it is additionally incorporated into services, finders, and database
queries. See [`Where to check permissions`](https://docs.gitlab.com/development/permissions/authorizations/)
and the API helper's backend
[`authorize!`](https://github.com/gitlabhq/gitlabhq/blob/master/lib/api/helpers.rb).

**Applicable lesson:** a MyWisata capability may be enabled by more than one
independent verification route. The UI may consume the same resolved ability,
but a sensitive endpoint must read current facts and authorize again rather
than trust the UI snapshot or an old cached tier.

### 3. Discourse: trust level coexists with independent predicates

Discourse has ordinal trust levels, but its authorization is not merely
`trust_level >= N`. `Guardian` methods compose the exact facts relevant to an
action. For example,
[`TopicGuardian#can_create_topic?`](https://github.com/discourse/discourse/blob/main/lib/guardian/topic_guardian.rb)
allows staff as one path; the ordinary-user path combines a user check, allowed
group membership, permission to create a post, and category visibility.
Other methods independently check whether a user is authenticated, silenced,
staff, a group moderator, the owner, or able to see the object.

Discourse also persists distinct user states and memberships. Its
[`User`](https://github.com/discourse/discourse/blob/main/app/models/user.rb)
supports user custom fields and a separate `staged` state, while automatic
groups independently represent admins, moderators, staff, logged-in users, and
trust levels in
[`Group`](https://github.com/discourse/discourse/blob/main/app/models/group.rb).
Trust level is therefore one input to capabilities, not a universal proof of
all user attributes.

The check is enforced in the write path. `PostsController#create` delegates to
the post creation pipeline, and
[`PostCreator`](https://github.com/discourse/discourse/blob/main/lib/post_creator.rb)
calls `guardian.can_create?(Post, @topic)` during validation before saving.
The client cannot obtain posting authority merely because the UI showed a
composer.

**Applicable lesson:** MyWisata may retain user labels such as "Phone Verified"
or "KYC Verified", but every feature should have its own `can_*` decision that
combines only its relevant facts and restrictions.

### 4. Saleor: granular permission sets and symmetric UI/API checks

Saleor's contribution guide requires restricted queries to declare named
permissions using `permission_required` or `one_of_permissions_required`; the
latter authorizes when at least one listed permission is present. Mutations
declare required permissions in their `Meta.permissions`. See
[`Saleor CONTRIBUTING — permissions in queries and mutations`](https://github.com/saleor/saleor/blob/main/CONTRIBUTING.md#how-to-define-permissions-in-queriesmutations).

The Dashboard uses the same named permission enum to control routes. Some
routes use `matchPermission="any"`, demonstrating a UI union over independently
granted permissions. See
[`saleor-dashboard/src/index.tsx`](https://github.com/saleor/saleor-dashboard/blob/main/src/index.tsx).
This client behavior is paired with server-declared query and mutation
permissions; it is not a substitute for them.

Saleor's repository guidance requires authorization tests for unauthenticated,
unprivileged, wrongly privileged, and correctly privileged actors. For
mutations, tests must prove not only that an error was returned but also that
data, webhooks, email, and external calls were not changed or triggered. See
[`Saleor AGENTS — GraphQL Authorization Tests`](https://github.com/saleor/saleor/blob/main/AGENTS.md#graphql-authorization-tests).

**Applicable lesson:** expose the same stable capability identifiers to
MyWisata frontend and backend, support explicit `any`/OR predicates where the
business rules permit alternative qualification, and test denied mutations for
absence of side effects.

## Why KYC must not imply phone or profile completion

This separation is not merely a product preference; it matches identity
standards.

OpenID Connect Core defines `email_verified` and `phone_number_verified` as
separate boolean claims. `phone_number_verified=true` specifically means the
provider took affirmative steps to establish control of that phone number. It
does not say that another identity-assurance event implies this fact. See
[`OpenID Connect Core 1.0, Standard Claims`](https://openid.net/specs/openid-connect-core-1_0-18.html#StandardClaims).

OpenID Identity Assurance places assured attributes inside `verified_claims`,
together with the verification process metadata. It deliberately identifies
which exact claims were verified so a recipient cannot confuse unverified
claims with verified ones. See:

- [`OpenID Identity Assurance Schema Definition 1.0`](https://openid.net/specs/openid-ida-verified-claims-1_0-final.html#name-verified-claims)
- [`OpenID Connect for Identity Assurance 1.0`](https://openid.net/specs/openid-connect-4-identity-assurance-1_0-16.html#name-verified-claims)

Therefore:

- Approved KYC may establish `kyc_approved` and the specific identity claims
  recorded as verified by the KYC provider.
- It establishes `phone_verified` only if phone ownership was explicitly part
  of that verification, the result records that fact, and MyWisata intentionally
  accepts that assurance method as equivalent to its OTP rule.
- It does not establish `profile_complete`, because profile completion is a
  MyWisata product-data requirement (photo, biography, preferences, and other
  configured fields), not a generic identity claim.

For the stated MyWisata rules, no such equivalence should be assumed: KYC,
phone verification, and profile completion remain independent.

## Recommended MyWisata model

### Persist facts independently

Use independent fields/state as the authorization inputs:

```text
email_verified_at
phone_verified_at
profile_completed_at
kyc_status = not_started | pending | approved | resubmission_required | rejected
kyc_approved_at
account/role/eligibility restrictions
```

`profile_completed_at` should describe completion of the MyWisata profile
fields only. Phone verification should not be one of the facts required to set
it, and KYC submission/approval should not require either phone verification or
profile completion.

If a `user_tier` field is retained for compatibility or display, treat it as a
derived summary or migration aid. It cannot faithfully represent valid states
such as `email + KYC approved, phone absent, profile incomplete` and therefore
must not be the authoritative input to capability decisions.

### Derive capabilities with explicit predicates

The corrected rules translate to the following independent predicates. All
authenticated capabilities assume the base registered account has verified
email and is not suspended or otherwise ineligible.

| Capability | Authoritative predicate | Result of independent completion |
|---|---|---|
| Sign in / browse | `email_verified` | Email-only user can use the platform |
| Booking | `email_verified AND phone_verified` | KYC/profile does not substitute for phone |
| Purchase | `email_verified AND phone_verified` | KYC/profile does not substitute for phone |
| Checkout | `email_verified AND phone_verified` | KYC/profile does not substitute for phone |
| Basic AI recommendation | `email_verified AND phone_verified` | KYC/profile does not substitute for phone |
| Submit recommendation | `email_verified AND (profile_complete OR kyc_approved)` | Either independent path grants this action |
| Generate affiliate link | `email_verified AND (profile_complete OR kyc_approved)` | Mode is limited for profile-only, full for KYC |
| Full affiliate tier | `email_verified AND kyc_approved` | Phone/profile not required |
| Earn commission | `email_verified AND kyc_approved` | Phone/profile not required |
| Request withdrawal | `email_verified AND kyc_approved AND payout/ledger requirements` | Phone/profile not required; request is still subject to financial checks |
| Approve withdrawal | `admin_authorized AND withdrawal_pending` | Never granted by customer verification state |

For affiliate mode, resolve the strongest independently earned entitlement:

```text
if kyc_approved: FULL
else if profile_complete: LIMITED
else: NONE
```

This is a capability-specific precedence rule, not a global user-tier ladder.
It preserves the original distinction: profile completion grants a limited
affiliate link but not withdrawal, while approved KYC grants the full affiliate
tier, commission earning, and withdrawal requests even when phone and profile
are incomplete.

### Required valid combinations

The implementation and tests should deliberately support these non-linear
states:

| Verified facts | Allowed | Still blocked |
|---|---|---|
| Email only | Sign in, browse | Commerce, AI, recommendation submission, affiliate, withdrawal |
| Email + phone | Commerce, checkout, basic AI | Recommendation submission, affiliate earnings, withdrawal |
| Email + profile | Submit recommendation, limited affiliate link | Phone-gated commerce/AI, full affiliate, earning commission, withdrawal |
| Email + approved KYC | Submit recommendation, full affiliate, earn commission, request withdrawal | Phone-gated commerce/AI |
| Email + phone + approved KYC, profile incomplete | Both phone and KYC capabilities, including full affiliate/withdrawal | Nothing that specifically requires unfinished profile fields, if such a future feature exists |
| Email + profile + approved KYC, phone absent | Submit recommendation, full affiliate, earn commission, request withdrawal | Booking, purchase, checkout, basic AI |

### UX should show parallel paths

The screenshot's `Step 1 of 5`, `Current: Phone`, and `Next: Identity` language
communicates a mandatory sequence. Replace that mental model with independent
status cards or selectable sections such as:

- Verify phone — unlock booking, purchase, checkout, and basic AI.
- Complete profile — unlock recommendation submission and limited affiliate.
- Complete KYC — unlock recommendation submission, full affiliate, commission,
  and withdrawal requests.

Users should be able to open any section directly. A blocked action should name
only its own unmet predicate and preserve the return path. For example, Checkout
asks for phone verification; Withdraw asks for KYC or payout/ledger remediation,
never for phone or profile merely because they appear earlier in a wizard.

### Backend revalidation and high-risk writes

For each API/RPC mutation:

1. Load current verification facts server-side.
2. Evaluate the named capability predicate from the shared policy contract.
3. Return a stable blocker code and recovery target on denial.
4. For recommendation, affiliate, commission, and withdrawal writes, enforce a
   matching database policy/trigger/RPC guard so service-role or alternate-call
   paths cannot bypass the rule.
5. For commission clearing and withdrawal, re-read and lock the relevant user,
   KYC, ledger, and withdrawal rows in the transaction. Recheck eligibility and
   balances immediately before the state or money mutation.
6. Keep withdrawal request eligibility separate from withdrawal approval:
   approved KYC permits the request; only an authorized admin may approve it.

The frontend may use a server-produced capability snapshot to render controls,
but stale snapshots are expected. It must handle the backend's typed denial and
show the same recovery UX. It must never send a tier value as proof of access.

## Design decision for MyWisata

Adopt a **fact set + named capabilities** model and explicitly retire the
assumption that the customer must progress through
`phone -> profile -> KYC`. The existing business rules remain intact when they
are represented per action:

- Phone grants only phone-gated commerce and basic AI.
- Profile grants recommendation submission and limited affiliate.
- KYC independently grants recommendation submission, full affiliate,
  commission earning, and withdrawal requests.
- Admin approval remains mandatory to complete a withdrawal.

This preserves every stated restriction while allowing users to complete phone,
profile, or KYC in the order that matches the features they actually want.
