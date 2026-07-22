# Industry Readiness Gaps Design

**Date:** 2026-07-22  
**Status:** Approved for planning; implementation not started

## Goal

Close the remaining industry-readiness gaps in verification, payout destination handling, withdrawal review, payout failure observability, monthly finance reporting, and production configuration without changing the existing Owner Account → Vendor → Outlet → Products/Bookings/Orders model.

## Scope

This design covers five implementation slices:

1. Actual Profile Completion percentage.
2. Bank Account and TNG eWallet payout destinations.
3. Approver notification and review detail completeness.
4. Payout failure details and separate monthly pending amounts.
5. Production configuration and runtime verification for Cron, email confirmation, OAuth email status, OCR, and TNG credentials.

The existing verification tiers, KYC workflow, wallet ledger, withdrawal approval workflow, dual approval, hold/resume flow, and vendor ownership model remain in place. No new account hierarchy is introduced.

## Approved decisions

### Profile Completion

The five required fields are weighted equally at 20% each:

- Full Name
- Profile Photo
- Short Bio
- City
- Country

The existing validation rules remain authoritative: Bio is 30–200 characters and a default avatar does not count. The Profile page displays this field-based percentage separately from the Wizard's step progress.

### Payout destinations

The system supports two destination types:

- `bank_account`, backed by Stripe Connect;
- `e_wallet`, backed by a TNG eWallet Direct Credit/API integration.

The application never collects or stores a TNG PIN. A user supplies a TNG-registered phone number or DuitNow account number and completes any authentication inside the official provider flow. The provider adapter stores only a verified provider reference and safe display metadata.

Each destination has a lifecycle: pending verification, verified, disabled, or rejected. A user may save multiple destinations but selects one active destination. Changing a destination requires re-verification and starts a 24-hour payout cooldown. A withdrawal stores an immutable destination snapshot so later destination changes cannot affect an existing request.

If TNG production credentials are unavailable, the production UI must show that TNG payouts are not configured and must reject TNG payout submission. Test environments may use a provider mock. A mock result must never be treated as a production payout.

### Approver notifications and review

Email and in-app notifications use the same withdrawal snapshot. Required content:

- customer display name and user ID;
- withdrawal request ID;
- amount and currency;
- request time;
- KYC status;
- risk level and risk reasons;
- Reward and Affiliate source totals;
- payout destination type and masked identifier;
- link to the review page.

Notifications exclude identity-document numbers, KYC files, TNG PINs, and other secrets. The snapshot is the state at request time; the review page can show current risk state as a separate value.

The review page adds read-only, paginated views for Reward sources, Affiliate sources, complete Wallet Ledger, related booking/order/payment/refund/withdrawal history, and detailed fraud flags. Approvers cannot edit ledger or risk data from this page.

### Payout failures

Each failed provider operation stores:

- provider name;
- provider event or transfer ID;
- provider error code;
- provider message after secret/PII redaction;
- normalized failure category;
- failure timestamp;
- retryable flag.

The UI displays a safe customer-facing explanation and a more detailed restricted explanation to Approvers. The first failure does not auto-retry. Reserved funds are restored according to the existing withdrawal rule, and any later retry must be explicitly approved and use an idempotency key.

### Monthly reporting

The monthly report exposes separate amounts for:

- Pending Earnings: rewards still inside the clearance window;
- Pending Withdrawal: submitted withdrawals awaiting approval or processing;
- Reserved Amount;
- Available Amount;
- completed payout amount;
- payout fees.

The report also retains user, date, and source detail. The UI must consume the same field names returned by the report function; no field may be rendered from an absent or legacy name.

### Production verification

Production acceptance requires runtime evidence, not only source code:

- Vercel Production has `CRON_SECRET` and the Cron is bound to the maintenance route;
- a maintenance run is observed in logs and proves clearance, escalation, notification, and report behavior;
- Supabase Production has Confirm Email enabled and a real registration test completes the verification flow;
- Google OAuth users with a trusted `email_verified` claim receive Email Verified status but still need phone, profile, and KYC for higher tiers;
- Production has `GOOGLE_AI_KEY`; OCR failures remain eligible for clearly labelled manual review;
- TNG production credentials are configured before TNG payout is advertised as enabled.

## Architecture

The feature changes are organized around existing boundaries rather than a broad refactor:

1. Reuse the existing verification eligibility module for the single source of truth for profile percentage.
2. Extend the existing payout destination model with a provider interface so Stripe and TNG share validation, lifecycle, masking, cooldown, and snapshot behavior.
3. Build withdrawal review data as read-only projections over existing wallet, source, transaction, risk, and audit records.
4. Extend withdrawal and provider event records with normalized failure details while preserving raw provider data only in restricted storage.
5. Align the database report contract and report UI, then verify operational settings in the deployed environments.

No PIN, KYC document, or unredacted provider secret crosses the application UI or notification boundary.

## Data flow

### TNG payout

```text
User enters TNG phone/DuitNow account
  -> provider verification/authorization
  -> verified destination reference
  -> 24-hour cooldown
  -> withdrawal request snapshots destination
  -> Approver approval
  -> TNG Direct Credit request with idempotency key
  -> provider webhook/status update
  -> Completed or Failed with normalized reason
```

### Withdrawal review

```text
Withdrawal request
  -> immutable request snapshot
  -> approver notification snapshot
  -> read-only review projection
  -> approval/rejection/hold audit event
  -> payout provider event
  -> wallet ledger and customer notification
```

## Error handling and security

- Provider calls are server-side only and use idempotency keys.
- Destination changes invalidate prior verification and cannot bypass the cooldown.
- TNG PINs are never accepted by application endpoints.
- Provider messages are redacted before persistence or display.
- Notification content is masked and excludes KYC documents and credentials.
- Failed payouts cannot silently consume reserved funds or create a second payout.
- Cron handlers remain authenticated and idempotent.
- OCR remains advisory; Admin approval remains the final KYC decision.

## Testing and acceptance

Each slice must have unit or contract tests before implementation is considered complete:

- five-field profile percentage boundaries and Profile-page rendering;
- payout destination validation, verification lifecycle, masking, cooldown, snapshots, and provider selection;
- TNG PIN rejection and mock-provider success/failure behavior;
- notification payload completeness and redaction;
- read-only review projections for source, ledger, transaction, and fraud data;
- provider failure normalization, redaction, retry policy, and fund restoration;
- report function/UI contract for both pending amounts and fees;
- Cron authentication, idempotency, and operational checklist evidence;
- email/password and Google OAuth tier behavior;
- OCR success, missing-key fallback, and manual-review status.

## Out of scope

- Changing the Owner Account → Vendor → Outlet relationship.
- Replacing Stripe Connect for bank payouts.
- Collecting TNG PINs or implementing an unofficial TNG login screen.
- Automatically approving KYC based only on OCR.
- Removing Admin approval from withdrawals.
- Treating local mock credentials as proof of production provider readiness.

