# Withdrawal Identity, Assistant, and Resilience Design

**Date:** 2026-09-12
**Status:** Approved design; awaiting written-spec review

## Context

A live RM 50 withdrawal demonstration confirmed that MyWisata already supports
customer submission, administrator review, provider processing, approval,
rejection, settlement, and customer transaction history. The demonstration also
exposed four trust and usability gaps:

1. A customer can enter any syntactically valid TNG phone number or DuitNow ID.
   The non-production mock provider treats that identifier as verified without
   proving that it belongs to the authenticated customer.
2. The customer Wallet can spend too long in loading or submitting states when
   development compilation, campus connectivity, or an application request is
   slow.
3. Gemini relevance results are advisory in the server guard, but the current
   withdrawal-detail UI does not provide a clear, tamper-resistant review step
   that lets an administrator read and consciously override non-blocking advice.
4. A later money-formatting change removed the explicit plus and minus signs
   from customer ledger history, leaving colour as the primary debit/credit cue.

The existing withdrawal lifecycle, dual approval, KYC gates, wallet reservation,
provider settlement, callback verification, audit records, and Stripe behavior
are mature and must be preserved.

## Goals

1. Bind a TNG payout destination to the authenticated customer's OTP-verified
   `users.phone` value and reject every arbitrary phone or DuitNow identifier.
2. Make Wallet loading and withdrawal submission recover predictably from slow
   or failed requests without allowing duplicate withdrawals.
3. Present Gemini as a visible assistant: prohibited content is blocking, while
   relevance and tone advice can be consciously overridden.
4. Render explicit `+` and `-` signs for every customer-visible money movement.

## Non-goals

- Implement or claim production TNG Direct Credit identity verification.
- Change the Webpack development setup or the production bundler configuration.
- Change withdrawal statuses, approval counts, dual-approval thresholds, KYC,
  balances, ledger writes, Stripe settlement, or TNG callback settlement.
- Delete historical payout destinations automatically.
- Add a global request framework or a new shared UI abstraction with only one
  consumer.
- Add a database migration or a new package dependency.

## Reuse Decisions

| Candidate | Path | Decision | Reason |
| --- | --- | --- | --- |
| Authenticated destination API | `app/api/wallet/destinations/route.ts` | Extend | It already owns authentication, provider capability checks, masking, and the service-only save RPC. |
| TNG normalization and provider | `lib/payouts/destinations.ts`, `lib/payouts/providers/tng-direct-credit.ts` | Reuse and extend | Existing normalization, deterministic opaque references, and masked references are the correct provider boundary. |
| Verified phone fact | `users.phone`, `users.phone_verified_at` | Reuse | OTP promotion already makes these server-managed, globally unique identity facts. |
| Customer Wallet | `app/customer/wallet/page.tsx` | Extend | It already owns destination selection, withdrawal submission, readiness, and refresh orchestration. |
| Signed transaction helper | `lib/wallet/transaction-display.ts` | Repair and reuse | The helper was originally created for signed amounts; restoring its direction-based sign avoids parallel formatting logic. |
| Debit semantic token | `text-wallet-debit` in `app/globals.css` | Reuse | It already provides accessible light/dark debit colour while the sign supplies the primary meaning. |
| Wallet moderation guard | `lib/wallet/moderation-guard.ts`, `lib/moderation.ts` | Extend | These modules already centralize Gemini policy, audit metadata, timeouts, and rate limits. |
| Withdrawal decision UI | `components/admin/withdrawal-review-detail.tsx` | Extend | It already owns category, note, confirmation, stale-state clearing, and action submission. |
| Existing timeout/retry examples | `app/admin/wallet/settings/page.tsx` | Reuse pattern | Its `AbortController`, timeout cleanup, local error, and Retry behavior fit the Wallet without introducing a global framework. |
| Ticket token helper | `lib/tickets/tokens.ts` | Reject direct reuse | Its claims and development fallback secret are ticket-specific. The moderation credential needs its own strict claims and fail-closed secret handling. |
| New shared Wallet form or request framework | N/A | Reject | There is only one concrete consumer, and an abstraction would expand scope without reuse value. |
| Production TNG adapter | N/A | Reject | The repository has no reviewed production TNG API or identity contract; only mock mode is supported. |

**Reuse audit complete.**

## Design

### 1. Identity-bound TNG destination

The browser must never choose the TNG identity used for payout.

- The Wallet displays only a masked version of the current verified phone, such
  as `+60••••3951`.
- Creating an e-wallet destination sends only `{ type: "e_wallet" }`. The strict
  request schema rejects `phoneOrDuitNow` and other unexpected identity fields.
- The server reads `users.phone` and `users.phone_verified_at` for the current
  authenticated user. A missing phone or verification timestamp fails closed.
- The server normalizes that phone through the existing TNG identifier helper,
  passes it to the configured mock provider, and saves only the provider's
  opaque reference and masked reference through
  `save_verified_payout_destination`.
- The destination list marks historical TNG destinations that do not match the
  current verified-phone-derived provider reference as unavailable. It does not
  reveal either provider reference to the browser.
- Withdrawal submission independently repeats the identity match before calling
  `submit_wallet_withdrawal`. This server-side recheck prevents a crafted client
  or an old arbitrary destination from bypassing the UI.
- Existing mismatched destinations remain stored for auditability but cannot be
  selected or used. Deletion and data migration are outside this change.
- Stripe bank destinations keep their existing behavior.

### 2. Wallet loading and submission resilience

The Webpack development command remains `next dev --webpack`. This design
addresses application requests after route compilation, not the campus network
or the bundler itself.

- Destination, withdrawal, and transaction-history work is allowed to progress
  independently. A failure in one surface does not erase successful data in
  another surface.
- Reads use an approximately eight-second abort window and render a localized,
  section-level error with Retry instead of an indefinite spinner.
- A successful withdrawal `201` response immediately closes the form and shows
  the existing submission-success feedback. Balance, request list, and history
  refresh in the background instead of delaying the success state.
- A withdrawal request uses a longer action timeout. If the browser times out,
  the UI enters an explicit “confirming outcome” state instead of declaring
  failure.
- Outcome reconciliation reloads the authenticated customer's withdrawals and
  checks for the submitted amount and request time window. The submit control
  stays disabled until the system either finds the new request or completes a
  bounded reconciliation attempt with no match.
- The existing database active-withdrawal guard remains the final protection
  against duplicates. Existing exponential-backoff settlement polling remains
  unchanged and is not replaced with high-frequency polling.
- Cold Webpack compilation can still show Next.js `Rendering...`; the UI does
  not claim to eliminate that development-only phase.

### 3. Explicit signed transaction amounts

Customer-visible ledger amounts use their authoritative `direction`:

- `credit` renders as `+RM50.00` with the normal foreground colour.
- `debit` renders as `-RM50.00` with `text-wallet-debit`.
- The sign is always present and is the primary money-movement cue; colour and
  direction icons remain supplementary.
- The existing pending withdrawal row continues to render `-RM`.
- `withdrawal_complete` stays hidden from customer history because the earlier
  `withdrawal_reserve` is already the customer-visible debit. A failed or
  rejected withdrawal return remains a `+RM` credit.
- All amounts keep the shared MYR formatting contract and two decimal places.

### 4. Gemini rejection assistant

Withdrawal rejection uses a two-step, server-authoritative review:

1. The administrator selects a rejection category and enters a 10–500 character
   reason.
2. Continue sends the category and reason to a permission-gated moderation
   preview endpoint.
3. Gemini returns strict structured fields for prohibited content, relevance,
   professional tone, categories, and a short advisory message.
4. Prohibited content, moderation unavailability, timeout, and rate limiting are
   blocking. No review credential is issued.
5. A relevance or tone concern is advisory. The UI displays the advice and
   offers “Return to edit” and “Continue anyway”.
6. A clear or consciously overridden advisory result produces a short-lived,
   HMAC-signed credential. Its claims bind actor ID, withdrawal ID, action,
   reason category, SHA-256 reason hash, verdict, issued time, and expiry.
7. The credential uses a dedicated server-only signing secret and has no
   insecure fallback. It is never logged.
8. Final rejection verifies authorization, expiry, signature, actor,
   withdrawal, category, and reason hash before invoking the existing rejection
   RPC. Any edit invalidates the credential and returns the UI to preview.
9. The preview is the only Gemini call. Final submission verifies the credential
   instead of invoking Gemini again, avoiding duplicated latency and rate-limit
   consumption.

The existing `wallet_moderation_attempts` record remains metadata-only. The
complete administrator reason continues to live only in the existing withdrawal
decision audit record.

## Error Handling

- Unauthenticated or unauthorized destination and moderation requests fail
  before service-role access or provider work.
- Missing or unverified customer phone returns a stable identity-verification
  error and links the customer to the existing phone verification flow.
- A mismatched historical destination is returned only as disabled, masked
  display data and is rejected again at withdrawal submission.
- Provider failure never saves a destination.
- Read timeouts preserve already loaded Wallet sections and expose Retry.
- Ambiguous withdrawal submission timeouts reconcile before permitting another
  attempt.
- Invalid, expired, mismatched, or forged moderation credentials cannot execute
  rejection.
- React renders Gemini advisory text as ordinary escaped text. Model output is
  length-limited and never interpreted as HTML.

## Testing and Verification

Focused tests must prove:

- destination creation ignores browser identity choice and uses only the
  authenticated OTP-verified phone;
- arbitrary phone and DuitNow fields are rejected by the strict API schema;
- missing/unverified phones and mismatched historical destinations fail closed;
- provider references and full phone values are not returned to the browser;
- withdrawal submission repeats the identity match;
- credit and debit helpers render `+RM` and `-RM`, including withdrawal reserve,
  return, refund, purchase, and adjustment cases;
- slow Wallet reads become retryable section errors;
- successful submission feedback does not wait for background refresh;
- an ambiguous timeout reconciles before re-enabling submission;
- prohibited Gemini results cannot issue a credential or execute rejection;
- relevance and tone advice can be explicitly overridden;
- edited reasons, wrong actors, wrong withdrawals, expiry, and forged signatures
  invalidate moderation credentials;
- raw reasons, signing secrets, provider references, and full phone values do
  not appear in client payloads or moderation-attempt audit rows.

Final verification will run focused Vitest files, `npx tsc --noEmit`,
`npm run lint`, and one focused read-only security/privacy review. Existing
unrelated checkout worktree changes are outside scope and must remain untouched.

## Risks

- The TNG provider flow remains a non-production mock. Identity binding proves that
  MyWisata selected the authenticated user's verified platform phone; it does
  not prove a production TNG account contract.
- Changing or rotating the mock webhook secret changes deterministic provider
  references and therefore disables old mock destinations. Customers can create
  a new identity-bound destination after rotation.
- Client-side timeouts do not cancel work already accepted by the server, which
  is why reconciliation and the database active-withdrawal guard are mandatory.
- A fail-closed Gemini outage temporarily prevents rejection. This preserves the
  existing policy and is visible to administrators as a retryable service error.
- The moderation credential secret becomes a required deployment setting; a
  missing secret disables rejection preview and final rejection rather than
  weakening verification.
