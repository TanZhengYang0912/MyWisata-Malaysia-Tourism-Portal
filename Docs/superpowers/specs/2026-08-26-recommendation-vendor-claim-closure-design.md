# Recommendation Vendor Claim Closure Design

**Status:** Approved design, pending implementation

**Created:** 2026-08-26

**Branch:** `feature/governance-wallet-recommendation-hardening`

## Context

The intended journey is:

1. A customer recommends a vendor.
2. An administrator approves the recommendation.
3. An administrator sends a secure invitation to the recommended vendor.
4. The vendor opens the link and submits onboarding information.
5. A pending vendor appears in Admin Vendor Approval.
6. Approving that vendor completes the recommendation conversion and starts the recommender reward flow.

The codebase contains most of this journey, but it is not currently a dependable end-to-end flow:

- Recommendation approval emails the recommender only. The vendor invitation is a separate admin action.
- The vendor-claim API calls an 11-parameter `claim_vendor_recommendation` RPC, while the linked database still exposes the legacy 7-parameter signature. A real claim therefore fails before creating a manageable pending vendor.
- The custom vendor invitation email path can return HTTP 201 even when email delivery fails, causing the Admin UI to report “Invite sent” incorrectly.
- Vendor approval and recommendation conversion are separate actions. A claimed recommendation is in `onboarding`, but the existing manual conversion UI only lists `approved` recommendations, so the flow can become permanently stuck.

## Goals

- Make the full recommendation-to-vendor journey operational and traceable.
- Ensure a successful vendor claim creates records that are visible and manageable in Admin Vendor Approval.
- Prevent the UI from reporting a vendor invitation as sent when email delivery failed.
- Make claimed-vendor approval and recommendation conversion one atomic database operation.
- Deploy the missing database behavior through a new timestamped migration without replaying legacy migrations.
- Preserve the current admin page skeleton and existing UI patterns.

## Non-goals

- Automatically invite every vendor immediately when a recommendation is approved.
- Redesign Recommendation Moderation or Vendor Approval pages.
- Add a new KYC, registration-document, or business-verification hard gate.
- Change vendor rejection, request-information, suspension, or ordinary non-recommendation vendor approval behavior.
- Replace the existing email provider or build a general-purpose custom-email outbox.
- Refactor unrelated recommendation, wallet, withdrawal, or reward code.

## Chosen Design

### 1. Vendor invitation lifecycle

The existing Admin Recommendation detail action remains the explicit trigger for inviting a vendor.

The invitation route will:

1. Verify the administrator and recommendation eligibility.
2. Generate the raw invitation token and store only its hash.
3. Insert the invitation record while leaving the recommendation in its existing state.
4. Send the custom invitation email.
5. Only after confirmed email success, move the recommendation to `invited`.

If email delivery fails:

- Mark the newly created invitation `cancelled` so the undelivered token cannot later be treated as active.
- Leave the recommendation at its previous status, normally `approved`.
- Return a non-2xx response with an explicit delivery error.
- Keep SMTP/provider details in server logs and return only a safe admin-facing message.

The Admin UI will only show the success toast for a response that confirms `emailSent: true`. A non-2xx response or an explicit false value will show an error and retain the Invite Vendor action.

If the email succeeds but the final recommendation status update fails, the route will log the synchronization failure. The invitation remains usable because claim validation accepts an eligible approved recommendation with a valid active invitation. The response will distinguish `emailSent` from `statusSynced`, allowing the UI to warn the administrator without claiming the email failed.

### 2. Vendor claim deployment

A new timestamped migration will deploy the current guided claim contract under the 11-parameter signature already called by `app/api/vendor/claim/route.ts`.

The RPC will perform one transaction that:

- Validates the authenticated user, invitation token hash, invite status, expiry, recommendation state, and intended vendor email.
- Prevents an invite from being claimed more than once.
- Creates or updates the vendor as `pending`.
- Creates or updates the vendor onboarding profile as `submitted`.
- Creates the initial outlet as inactive and `pending_review`.
- Records the relationship in `vendor_recommendation_claims`.
- Marks the invitation `claimed`.
- Moves the recommendation to `onboarding`.

The RPC will not approve or activate the vendor. That remains an administrator decision. The returned vendor identifier must match the pending vendor shown in Admin Vendor Approval.

The migration will be additive and timestamped. It will not rename or edit the legacy `095_recommendation_guided_vendor_claim.sql` file, and the deployment process will not run a blind `supabase db push` against unrelated legacy migration-history differences.

### 3. Atomic vendor approval and recommendation conversion

A new security-definer RPC, `admin_approve_claimed_vendor`, will own the approval transaction.

It will:

1. Require an authenticated administrator with the existing vendor-approval capability.
2. Lock and validate the target vendor.
3. Approve the vendor and its submitted onboarding profile.
4. Ensure the approved user has the `vendor_owner` role.
5. Look up a claim in `vendor_recommendation_claims` for that vendor.
6. If a claim exists, invoke the existing claimed-recommendation conversion rules within the same transaction.
7. Return the approved vendor, whether a claim was converted, and the resulting recommendation/conversion identifiers.

The existing conversion rules remain authoritative for claim ownership, self-dealing prevention, recommendation eligibility, duplicate conversion prevention, and reward creation. If conversion fails, vendor approval must roll back. This prevents an approved vendor from being detached from a stuck recommendation.

For a vendor that was not created from a recommendation claim, the same RPC performs the normal vendor approval and returns `converted: false`.

The Admin vendor approval route will call this RPC for the approve action. Audit-log and notification side effects occur only after the RPC succeeds. Reject and request-information branches remain unchanged.

## State Flow

```text
recommendation: approved
        |
        | admin sends vendor invite
        v
recommendation: invited + invite: invited
        |
        | vendor submits guided claim
        v
recommendation: onboarding + invite: claimed
vendor: pending + onboarding profile: submitted + outlet: pending_review
        |
        | admin approves vendor
        v
vendor: approved + onboarding profile: approved + vendor_owner role
recommendation: converted + conversion/reward records created
```

An email failure exits before the first state transition and cancels the unusable invitation. A claim or conversion failure rolls back its whole database transaction.

## Authorization and Privacy

- Raw invitation tokens are sent only to the vendor and are never stored in the database; only token hashes are persisted.
- Claim lookup continues to validate token hash, expiry, status, recommendation relationship, and intended email.
- The claim RPC uses the authenticated user identity rather than accepting an owner ID from the client.
- The approval RPC derives the administrator from `auth.uid()` and uses existing capability checks.
- The browser does not receive SMTP credentials, provider error payloads, token hashes, or internal database details.
- Existing self-recommendation and duplicate-reward protections remain enforced by the conversion RPC.

## Error Handling

- **Invitation insert failure:** return an explicit server error; no email is attempted.
- **Email send failure:** cancel the inserted invitation, retain the recommendation’s previous status, and return an explicit delivery error.
- **Claim validation failure:** create no vendor/onboarding/outlet/claim records.
- **Claim transaction failure:** roll back all claim-side records and status changes.
- **Approval/conversion failure:** roll back vendor approval, role grant, conversion, and reward changes together.
- **Post-transaction audit/notification failure:** log the failure without reversing the already committed approval transaction; existing retry/error conventions apply.

## Expected Files in Implementation

- `supabase/migrations/20260826024400_recommendation_vendor_claim_closure.sql`
  - Deploy the 11-parameter claim RPC.
  - Add `admin_approve_claimed_vendor` and grants.
- `app/api/admin/vendors/recommendation-invite/route.ts`
  - Correct invitation/email state ordering and error responses.
- `components/admin/recommendation-detail-view.tsx`
  - Require confirmed email success and display synchronization warnings/errors.
- `app/api/admin/vendors/[id]/approve/route.ts`
  - Use the atomic approval RPC for approve actions.
- Focused route, migration-contract, and component tests adjacent to the existing test organization.

## Files and Areas Explicitly Not Touched

- Withdrawal processing and wallet ledger logic.
- Customer wallet balances or test-credit tooling.
- Recommendation submission forms.
- Vendor rejection/request-information/suspension semantics.
- Global Admin layout, navigation, and design tokens.
- Email provider configuration and unrelated email templates.

## Dependencies and Database Impact

- No new npm dependency.
- One new timestamped Supabase migration.
- No destructive table change and no data deletion.
- Existing tables and conversion/reward functions are reused.
- Existing failed or legacy records are not silently mutated; remediation of any specific stale record requires a separately verified data operation.

## Verification

Implementation will follow test-driven development:

1. Add failing invitation-route tests for email failure, cancellation, and truthful response behavior.
2. Add failing approval-route tests proving it calls the atomic RPC and does not report approval after conversion failure.
3. Add migration contract tests for both required RPC signatures and authorization/grant statements.
4. Implement the smallest code and SQL changes necessary to pass them.
5. Run affected tests, `npm run lint`, and `npx tsc --noEmit`.
6. Apply only the new timestamped migration to the linked Supabase project.
7. Probe the remote 11-parameter claim function with an unauthenticated harmless request: the expected result is an authentication/validation error, not `PGRST202` missing-function error.
8. Verify the approval RPC is present remotely and rejects unauthenticated access.
9. If safe test data is available, complete one sandbox invitation/claim/approval journey and confirm the pending vendor appears in Admin Vendor Approval before approval and the recommendation becomes converted afterward.

## Risks

- Direct SMTP delivery is not transactionally coupled to database state. The design minimizes false success and leaves a valid invite usable if the post-send status sync fails, but it does not provide durable custom-email retries.
- Existing linked-database migration history differs from old local numeric migrations. Deployment must target only the new timestamped migration.
- Atomic approval may surface existing conversion-policy violations that were previously hidden by separate actions. This is intentional: approval will fail safely rather than create split state.
- Existing legacy `processing` or `onboarding` records are not automatically repaired by this migration.
