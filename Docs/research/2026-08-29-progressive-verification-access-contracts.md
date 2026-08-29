# Progressive verification and access contracts

**Date:** 2026-08-29

**Status:** Research complete

**Scope:** Public first-party documentation and source code, plus a read-only
inventory of MyWisata. This note does not change the accepted MyWisata tier
ladder.

## Question

How should MyWisata keep progressive verification consistent across visible
frontend actions, API authorization, and database enforcement without forcing
every newly registered user to complete the whole profile?

## Mature-project patterns

### 1. The backend owns authorization; frontend checks improve UX

GitLab recommends defense-in-depth from low-level services and finders through
GraphQL, REST, and controllers. It explicitly warns that display-layer checks
are for better UX and are not security checks. For JavaScript/Vue screens,
GitLab exposes a backend-computed ability through `push_frontend_ability`, then
checks the same underlying ability in backend code.

This is the closest match for MyWisata: the frontend should receive a resolved
capability decision, not independently reinterpret the tier ladder. Every
mutation must still recheck authorization on the server.

Source: [GitLab — Where to check permissions](https://docs.gitlab.com/development/permissions/authorizations/)

### 2. Send contextual capabilities with the resource or page payload

Discourse centralizes authorization in its `Guardian` methods, such as
`can_create_topic?`, while its topic-list API contract exposes
`can_create_topic` to clients. The UI can therefore render the correct action
state without becoming the authority that grants the action.

For MyWisata, `/api/auth/me` or a dedicated access endpoint can expose
capability decisions such as `checkout`, `recommendation_submit`, and
`withdrawal`, while the corresponding routes and RPCs remain authoritative.

Sources:

- [Discourse Guardian topic authorization](https://github.com/discourse/discourse/blob/main/lib/guardian/topic_guardian.rb)
- [Discourse topics API contract](https://github.com/discourse/discourse/blob/main/spec/requests/api/topics_spec.rb)

### 3. Errors are typed contracts, not English strings

Saleor requires mutations to define relevant error-code enums rather than use
one generic error family. Its contribution guide also requires a permission
denial to identify the required permissions. This lets a frontend implement a
specific recovery path rather than display a generic failure.

MyWisata should use stable blocker codes such as
`PHONE_VERIFICATION_REQUIRED`, `PROFILE_COMPLETION_REQUIRED`, `KYC_REQUIRED`,
and `KYC_PENDING`. Localized frontend copy should be selected from those codes;
the API message remains a fallback, not the primary UX contract.

Source: [Saleor contribution guide — permissions and error codes](https://github.com/saleor/saleor/blob/main/CONTRIBUTING.md)

### 4. Step up only when the requested action needs a higher level

Keycloak describes step-up authentication as requesting the level of
authentication needed for a resource. Its level model is cumulative: a higher
level includes the preceding levels. GitHub's sudo mode applies the same UX
principle to sensitive account operations: an already signed-in user is asked
to authenticate again when the sensitive action is attempted.

This supports MyWisata's existing cumulative ladder:

`email_verified → phone_verified → profile_complete → kyc_verified`

It does not support forcing every email-verified user through all remaining
steps before ordinary browsing.

Sources:

- [Keycloak server administration guide — step-up authentication](https://www.keycloak.org/docs/latest/server_admin/)
- [GitHub Docs — sudo mode](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/sudo-mode)

## Applied MyWisata contract

The accepted rules remain unchanged.

| Capability | Required state | Frontend action | API denial contract | Authoritative enforcement |
|---|---|---|---|---|
| Browse public platform | Guest or higher | Keep destinations, products, booking and affiliate surfaces visible | None for public reads | Public-route and RLS read policy |
| Sign in and browse | `email_verified` | Enter the normal customer experience; do not force the full profile | `EMAIL_VERIFICATION_REQUIRED` only when the auth account is not confirmed | Supabase Auth and user tier reconciliation |
| Booking, purchase, checkout | `phone_verified` | On the first committing action, explain that only phone verification is required; return to the original checkout afterward | `PHONE_VERIFICATION_REQUIRED`, with capability and required/current tier details | Route check plus order/checkout database guard |
| Basic AI recommendation | `phone_verified` | Keep the AI entry visible; show the same phone-verification recovery when invoked | `PHONE_VERIFICATION_REQUIRED` | Personalized-recommendation API |
| Submit recommendation | `profile_complete` | Keep the action visible; explain the remaining profile steps and resume the form after completion | `PROFILE_COMPLETION_REQUIRED`, including missing profile steps | Route check plus recommendation RPC |
| Generate limited affiliate link | `profile_complete` | Keep the affiliate preview visible; explain limited mode and remaining profile requirements | `PROFILE_COMPLETION_REQUIRED` | Route check plus affiliate insert policy/RPC boundary |
| Accrue limited affiliate attribution | `profile_complete` | Show pending/capped trial attribution accurately; do not present it as withdrawable money | Stable limited-mode status, not a generic permission failure | Click/attribution limits and KYC-gated clearing |
| Full affiliate and clear commission | approved `kyc_verified` | Explain that KYC upgrades limited affiliate mode and releases eligible pending commission | `KYC_REQUIRED`, `KYC_PENDING`, or `KYC_RESUBMISSION_REQUIRED` | Attribution clearing service and wallet credit boundary |
| Request withdrawal | approved `kyc_verified`, eligible earnings, verified payout destination | Keep Withdraw visible; on click show the first concrete blocker | Typed blocker such as `KYC_REQUIRED`, `PAYOUT_DESTINATION_REQUIRED`, or `MINIMUM_NOT_MET` | Withdrawal route plus atomic withdrawal RPC |
| Approve withdrawal | Admin approval | Show submitted/pending status to the customer | Customer cannot call the approval operation | Admin role policy and approval RPC |

## Current MyWisata inventory

Existing pieces to reuse:

- `lib/constants.ts` already defines the tier order and required tier per
  feature.
- `lib/auth/customer-capabilities.ts` already resolves customer-facing
  capabilities.
- `components/customer/use-customer-capability-gate.ts` already preserves a
  safe return path.
- Checkout, recommendations, affiliate generation, and withdrawals already
  have server-side checks.
- Checkout/order creation, recommendation submission, affiliate inserts, and
  withdrawals already have database or RPC enforcement.
- Limited affiliate links already accrue capped pending attribution, and
  clearing keeps money pending until approved KYC.

Confirmed consistency gaps:

1. Frontend decisions are derived locally from the tier while APIs and SQL
   independently reproduce the same rules. SQL comments already acknowledge
   that this can drift.
2. The frontend uses `profile_completion_required`, but recommendation and
   affiliate APIs return `TIER_INSUFFICIENT`; recommendation can separately
   return `PROFILE_INCOMPLETE`.
3. Checkout redirects on page load instead of explaining the phone-only gate
   at the committing action.
4. Basic AI returns `PHONE_VERIFICATION_REQUIRED` from the API, while its
   frontend treats that response as a generic load error.
5. The affiliate ineligible screen points users to KYC even though limited
   affiliate generation requires only `profile_complete`.
6. The profile page presents one five-step mandatory wizard. It returns to
   checkout immediately after phone verification, but other continuations are
   inconsistent, and the final survey save does not use the continuation.
7. Most client-side prechecks redirect immediately. They do not explain the
   blocker before navigation, and API denials caused by stale client state are
   not handled through the same recovery component.

## Recommended architecture

Use a server-resolved capability contract with database defense-in-depth.

1. Define canonical capability names and blocker codes once.
2. Resolve the current user's capability snapshot on the server from tier,
   KYC state, and feature-specific prerequisites.
3. Include that snapshot in the authenticated user payload. The frontend
   consumes the decision; it does not recompute tier rules.
4. Use one server helper in gated API routes to re-resolve the same capability
   immediately before mutation.
5. Return a stable error envelope containing `code`, `capability`,
   `currentTier`, `requiredTier`, and `nextAction`.
6. Keep SQL/RPC/RLS checks as the final non-bypassable boundary. Add parity
   tests that exercise every capability at every tier so application and
   database contracts cannot drift silently.
7. Route both proactive frontend checks and reactive API denials through one
   action-gate dialog. The dialog explains the blocker, offers “Not now” and a
   precise CTA, and retains a safe continuation.
8. Make verification intent-aware: checkout requests only the phone step;
   recommendation and limited affiliate request all remaining profile steps;
   withdrawal requests KYC and payout readiness in order. The cumulative tier
   ladder is unchanged.

## Rejected patterns

- Hiding every restricted feature. Users cannot discover what the platform
  offers or why an action is unavailable.
- Treating a disabled button with no explanation as authorization UX.
- Redirecting silently to a generic five-step profile wizard.
- Trusting a frontend boolean as authorization.
- Returning raw database exception text or a generic `TIER_INSUFFICIENT` for
  every recovery path.
- Maintaining unrelated TypeScript and SQL rule tables without a cross-layer
  parity test.
