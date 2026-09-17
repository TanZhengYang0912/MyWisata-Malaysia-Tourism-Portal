# Vendor Wallet Just-in-Time KYC Guidance Design

**Status:** Approved for implementation

**Date:** 2026-09-17

## Context

Vendor registration deliberately does not request IC evidence. The database already rejects withdrawal requests unless the authenticated user has approved KYC, but `/vendor/wallet` currently opens its withdrawal form without explaining that requirement. An unverified Vendor therefore reaches a low-level withdrawal error instead of a guided step-up flow.

The Customer Wallet already has the desired interaction: attempting a protected action opens a capability dialog, distinguishes unsubmitted, pending, and rejected KYC, provides a safe continuation, and preserves the server/database authorization boundary.

## Decision

Keep the Vendor inside the Vendor Portal for the entire recovery flow.

1. Mount the existing `CustomerCapabilityGateProvider` around the Vendor Portal.
2. Before opening or submitting the Vendor withdrawal form, inspect the authenticated KYC fact.
3. When KYC is not approved, open the existing capability dialog with a Vendor-specific qualification path to `/vendor/kyc` and continuation back to `/vendor/wallet`.
4. Extract the existing Customer KYC page implementation into one shared KYC submission component.
5. Render that shared component from both `/customer/kyc` and the new `/vendor/kyc` route, with portal-specific back links and continuation defaults.
6. Leave the existing withdrawal RPC and database KYC enforcement unchanged.

The shared customer entitlement hook will not be used for Vendor withdrawal eligibility because its current hard guard intentionally excludes `vendor_owner` and `outlet_manager`. The Vendor UI gate will derive only the KYC step-up decision from authenticated `verificationFacts`; the database remains authoritative when the withdrawal is submitted.

## User Flow

### KYC not submitted

- Vendor clicks **Withdraw funds**.
- The withdrawal modal remains closed.
- The existing capability dialog explains that approved KYC is required.
- **Complete KYC** opens `/vendor/kyc?capability=wallet.request_withdrawal&next=/vendor/wallet`.
- **Not now** closes the dialog without navigation.

### KYC pending or rejected

- Pending KYC shows the existing wait-for-review guidance and links to the Vendor KYC status page.
- Rejected KYC shows the existing resubmission guidance and links to the Vendor KYC page.

### KYC approved

- The withdrawal modal opens normally.
- Submission follows the existing Vendor withdrawal path.
- Existing RPC/database checks remain the final enforcement boundary.

## Reuse Decisions

| Candidate | Decision | Reason |
|---|---|---|
| `components/customer/customer-capability-gate-dialog.tsx` | Reuse | It already supports blocker-specific copy, Not now, qualification paths, and safe continuations. |
| `components/customer/use-customer-capability-gate.ts` | Reject for Vendor eligibility | Its capability decision correctly excludes Vendor roles under the current customer entitlement model. |
| `app/customer/kyc/page.tsx` | Extract and reuse | The complete KYC submission/status behavior exists and will have two route consumers. Importing one route entry from another would couple App Router route modules. |
| Existing Vendor withdrawal RPC | Keep | This change is a guidance feature, not a payout architecture rewrite; server/database KYC checks already exist. |
| New Vendor-specific KYC form | Reject | It would duplicate sensitive upload, validation, status, and continuation logic. |

**Reuse audit complete.**

## Files

Expected modifications:

- `app/vendor/layout.tsx`
- `app/vendor/wallet/page.tsx`
- `app/customer/kyc/page.tsx`
- `components/customer/customer-capability-gate-dialog.tsx` only if the existing public contract needs a small type/generalization change

Expected additions:

- one shared KYC submission component under `components/`
- `app/vendor/kyc/page.tsx`
- focused Vendor Wallet/KYC tests

Files explicitly out of scope:

- Supabase migrations and KYC tables
- Admin KYC review pages and APIs
- withdrawal amount, balance, payout destination, approval, and settlement rules
- Vendor registration and onboarding requirements
- Customer entitlement role eligibility

## Error Handling and Security

- The UI gate is guidance only and never becomes an authorization source.
- Missing or stale KYC facts fail closed in the UI and still fail at the database boundary.
- The continuation is passed through the existing safe internal-path sanitizer.
- No IC number, document path, signed URL, or raw evidence is added to Vendor routes, logs, or query parameters.
- Existing KYC upload validation, HMAC fingerprinting, private storage, and audited Admin document access remain unchanged.

## Verification

Use test-driven development:

1. Add failing tests proving the Vendor layout mounts the shared gate provider.
2. Add failing interaction/contract tests proving unapproved KYC prevents the withdrawal modal and invokes Vendor KYC recovery.
3. Add failing route/component tests proving `/vendor/kyc` reuses the same KYC implementation and returns to `/vendor/wallet`.
4. Implement the minimum production changes.
5. Run focused tests, `npx tsc --noEmit`, `npm run lint`, and one focused read-only authorization/privacy review.

## Success Criteria

- Vendor registration still requests no IC evidence.
- An unverified, pending, or rejected Vendor receives immediate, localized KYC guidance before the withdrawal form opens.
- The KYC CTA remains inside the Vendor Portal and safely returns to `/vendor/wallet`.
- An approved Vendor sees the existing withdrawal form without an extra prompt.
- Direct withdrawal attempts remain blocked by the existing database KYC requirement.
