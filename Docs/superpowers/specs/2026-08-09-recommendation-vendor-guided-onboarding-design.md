# Recommendation Vendor Guided Onboarding Design

**Status:** Approved in brainstorming; pending written-spec review  
**Date:** 2026-08-09

## Context

MyWisata supports two paths for a new Vendor to join:

1. Vendor self-registration.
2. A Customer recommends a business that is not yet on MyWisata, Admin approves the recommendation, and Admin invites the business to apply.

Neither path publishes a Vendor immediately. Admin must approve or reject the Vendor application, and only approved Vendors may appear on Customer-facing surfaces.

The current recommendation-claim flow is functional but creates unnecessary friction. A recipient without an account is sent through ordinary account registration, must leave the invitation flow to complete phone verification, and then return to a fixed form. The form also treats the recommendation category as free text even though recommendation submission uses four canonical active categories. The current claim transaction creates a pending Vendor and onboarding profile but, unlike self-registration, does not create the required first Outlet.

The goal is a user-friendly, guided invitation journey that creates the account inside the onboarding flow, reuses existing identity verification, preserves recommendation evidence, and atomically creates a pending Vendor with its first Outlet.

## Domain Decisions

### Recommendation creates a Vendor Owner application

A Customer recommendation represents a business that has not joined MyWisata. Claiming it creates:

- one new pending Vendor representing the brand or company;
- one Vendor onboarding profile;
- one first Outlet representing the recommended physical location;
- one recommendation claim owned by the invited account.

The claimant is the prospective Vendor Owner, not an Outlet Manager. Outlet Managers remain a separate role invited later by an approved Vendor Owner for a specific Outlet.

### Role lifecycle

Submitting the application does not immediately grant the active `vendor_owner` role. The applicant owns the pending Vendor through `vendors.owner_id`, while the existing Admin Vendor approval flow remains authoritative. Admin approval grants `vendor_owner` and binds it to the approved Vendor. The recommendation flow never grants `outlet_manager`.

### Canonical categories

Business category is not free text. The flow reads the active canonical categories from Supabase and supports the existing four-category taxonomy:

- Food
- Activity
- Accommodation
- Retail

The category submitted by the recommender is preselected. The Vendor can correct it by choosing another active category. UUIDs remain database-owned and are never hard-coded as UI values.

## Identity and Verification

### Account creation remains inside the invitation

The recipient never leaves for a generic registration journey. Step 1 offers only:

1. Email OTP.
2. Continue with Google.

Email OTP uses the invitation email and allows Supabase Auth to create the account when none exists. Google is accepted only when the Google identity email exactly matches the invitation email. The invitation token alone is not treated as email verification.

The invitation token and in-progress draft survive authentication redirects. After authentication, the server repeats the invitation email match before unlocking private contact evidence or permitting claim submission.

### Phone verification is User-level, not Vendor-level

No Vendor-specific phone-verification column or table is introduced. The onboarding reuses the existing User verification system:

- private account mobile: `users.phone` and `users.phone_verified_at`;
- send endpoint: `POST /api/phone/send-otp`;
- verify endpoint: `POST /api/phone/verify-otp`;
- verification provider: existing Twilio Verify integration;
- uniqueness rule: one verified mobile may belong to only one User.

An account with `phone_verified_at` already set skips phone OTP automatically. The flow must not call `send-otp` for that account unless the user explicitly chooses to change the verified mobile, because the existing endpoint clears prior verification when changing numbers.

An unverified account completes Phone OTP inside the guided onboarding. Email verification must complete first because the existing verification tier prevents phone verification from skipping email verification.

### Private mobile and business phone are separate

The private account mobile is used for identity and high-risk platform gates. It is not public.

The business phone belongs to the onboarding profile and first Outlet. It may be a landline, shared office number, or customer-service number, so it is not identity-verified and does not claim global User-phone uniqueness. The UI may offer an explicit “Use this mobile number as the Outlet contact number” convenience action, but never links the values implicitly.

Existing Checkout, Booking, Wallet, Withdrawal, Payout, and profile verification behavior remains unchanged.

## Guided User Experience

The selected direction is a three-step wizard. It uses plain language, visible progress, auto-save, and one primary action per step.

### Step 1 — Confirm account

- Explain that the account will be created within the invitation flow.
- Show the masked invitation email.
- Offer “Send 6-digit email code” and “Continue with Google”.
- Reject a Google or signed-in email that does not exactly match the invitation email.
- Unlock full recommendation contact evidence only after a successful email match.

### Step 2 — Review Vendor and first Outlet

Clearly separate brand-level data from location-level data.

Vendor section:

- business/brand name;
- legal business name;
- one of the four active canonical categories;
- recommendation description and recommendation reason as reference evidence.

First Outlet section:

- editable Outlet display name;
- Google place name and formatted address;
- location coordinates where available;
- business email;
- business phone, optional where the database allows it;
- recommendation photos as reference-only evidence.

All imported values are labelled “Prefilled from a customer recommendation”. The Vendor may correct them without changing the original recommendation evidence.

### Step 3 — Verify and submit

- Already phone-verified accounts display a verified state and skip OTP.
- Unverified accounts enter a private personal mobile and complete the existing Phone OTP inline.
- Show a final summary of owner, Vendor, category, first Outlet, and pending review status.
- Require confirmation that the claimant is authorised to represent the business.
- Submit once and disable duplicate submission while the transaction is running.
- Explain that the Vendor and Outlet remain private until Admin review.

Successful submission shows a clear application-submitted state. Approval, rejection, and requests for information continue through existing Admin review and notification mechanisms.

## Public Preview and Privacy

The public invitation preview remains privacy-safe:

- never expose recommender identity;
- mask invitation email and recommendation contact values before account match;
- never expose token hashes, raw storage paths, or internal image metadata;
- use short-lived signed recommendation-photo URLs;
- never place the raw invitation token in application logs, analytics, or database plaintext;
- preserve the recommendation evidence independently from Vendor edits.

The authenticated matching-email state may receive full prefill values. Every sensitive decision is repeated at the API or RPC boundary; UI state is not authoritative.

## Architecture

### Client responsibilities

The invitation client owns:

- the three-step state machine;
- local draft preservation across OTP and OAuth redirects;
- user-friendly field validation;
- category selection from the server-provided active set;
- verified/mobile-required presentation;
- mapping stable server error codes to recovery actions.

The client never decides whether an invitation, email match, phone verification, or claim is authoritative.

### Server responsibilities

Server endpoints own:

- invitation token hashing and state validation;
- masked anonymous preview and authenticated matching-email preview;
- Email OTP/Google callback return-path validation;
- authenticated User email comparison;
- User phone-verification status;
- category existence and active-state validation;
- strict claim payload validation;
- stable, non-technical error codes.

### Atomic claim transaction

The existing `claim_vendor_recommendation` RPC is upgraded so one transaction creates or updates all required records:

1. Lock and validate the one-time invitation.
2. Require authenticated User, invitation-email match, and User phone verification.
3. Require the recommendation to remain claimable.
4. Prevent a User from owning another pending or approved Vendor.
5. Validate the chosen active category.
6. Create `vendors` with `status = 'pending'`.
7. Create `vendor_onboarding_profiles` with `status = 'submitted'`.
8. Create the first `outlets` row with `status = 'inactive'` and `review_status = 'pending_review'`.
9. Create `vendor_recommendation_claims`.
10. Mark the invitation `claimed`.
11. Move the recommendation to `onboarding`.

The transaction takes an appropriate per-user and/or invitation lock so double submission cannot create duplicate Vendors or Outlets. Any failure rolls back every write.

The first Outlet follows the existing catalogue/outlet review lifecycle. Approving the Vendor does not bypass existing Outlet review requirements.

## Error and Recovery Design

Technical database field names and validation internals are never displayed to the recipient.

### Email mismatch

Explain which signed-in email is being used and show the masked invited email. Offer one primary “Switch account” action. Preserve the draft.

### OTP incorrect, expired, or rate-limited

Keep the recipient on the same step, show an inline explanation, provide resend timing, and preserve all form state. Do not show a generic request error when a stable reason is available.

### Verified-phone collision

Explain that one personal mobile can belong to only one account. Offer “Use another mobile” and “Sign in to the existing account”. Never treat the Outlet business phone as the identity phone automatically.

### Invitation expired, cancelled, or already used

Show a dedicated inactive-invitation state with actions to request a new invitation or contact MyWisata support. Do not expose token or database details.

### Submission failure

Keep the current step and draft. Map validation errors to the relevant visible section. Retryable server failures offer retry; non-retryable invitation or identity failures offer the appropriate recovery path.

## Compatibility and Impact

The design intentionally reuses existing identity infrastructure and approval rules.

Unchanged:

- Vendor self-registration;
- ordinary Customer registration and sign-in;
- existing Profile Phone OTP;
- Checkout, Booking, Wallet, Withdrawal, and Payout phone gates;
- Outlet Manager invitations;
- Admin Vendor Approve, Reject, and Request information;
- the existing rule that Admin approval grants `vendor_owner`;
- existing Vendor and Outlet records.

Changed:

- recommendation invitation authentication and onboarding presentation;
- recommendation claim transaction to create the first Outlet;
- onboarding profile status from incomplete draft behavior to a submitted application;
- category input from free text to an active category selection;
- placement of the existing Phone OTP inside the invitation journey.

No existing Vendor data requires migration or backfill.

## Verification Strategy

### Unit and component tests

- Three-step state transitions and progress labels.
- Recommendation prefill mapping into Vendor and Outlet fields.
- Four active categories and original-category preselection.
- Existing verified User skips Phone OTP.
- Unverified User receives inline Phone OTP.
- Private mobile and business phone remain independent.
- Draft restoration across Email OTP and Google redirects.
- Stable errors map to the correct user-friendly message and action.

### API tests

- Anonymous previews remain masked and exclude recommender identity.
- Authenticated matching-email previews unlock permitted prefill values.
- Email and Google mismatch remain blocked.
- Claim requires authenticated matching email and User phone verification.
- Inactive categories are rejected at the server boundary.
- Raw invitation tokens and storage paths are absent from logs and responses.

### Database contract tests

- Claim creates exactly one Vendor, onboarding profile, first Outlet, and claim.
- Vendor is pending, onboarding profile submitted, and Outlet inactive/pending review.
- Invitation and recommendation statuses advance together.
- Duplicate and concurrent submissions remain single-use.
- Mid-transaction failure leaves no partial Vendor or Outlet.
- `vendor_owner` is not granted by claim and remains granted by Admin approval.

### Regression tests

- Vendor self-registration still creates Vendor, onboarding profile, and first Outlet.
- Customer and Profile authentication flows remain unchanged.
- Existing phone-gated commerce and payout actions remain guarded.
- Outlet Manager invitation behavior remains unchanged.
- Admin Vendor approval and rejection remain functional.

### Browser verification

Use separate signed-out, unverified-account, verified-account, mismatched-email, and Google-email-mismatch contexts. Verify auto-save, authentication return, inline OTP recovery, responsive layout, submit locking, pending confirmation, and safe handling of a replayed invitation.

## Out of Scope

- A Vendor-specific phone-verification system.
- OTP verification of business or Outlet phone numbers.
- Redesigning ordinary Vendor self-registration.
- Migrating or backfilling existing Vendors.
- Creating or assigning an Outlet Manager from a recommendation.
- Publishing a Vendor or Outlet without Admin review.
- Claiming a recommended new Outlet under an already existing Vendor.
- Password-based onboarding for recommendation recipients.
