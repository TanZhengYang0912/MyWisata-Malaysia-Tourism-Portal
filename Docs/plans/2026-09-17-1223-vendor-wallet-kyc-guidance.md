# Vendor Wallet Immediate KYC Guidance Implementation Plan

> **For Codex:** Execute this plan in the current workspace using the `executing-plans` skill and test-driven development.

**Status:** Approved for implementation

**Goal:** Intercept Vendor Wallet withdrawals before the withdrawal modal opens when KYC is not approved, explain the current KYC state immediately, and route the vendor into the existing KYC submission flow without weakening the database withdrawal guard.

**Architecture:** Keep the existing withdrawal RPC and database KYC enforcement as the authoritative security boundary. Add a vendor-facing UI preflight decision derived only from authenticated verification facts, present it through the existing capability-gate dialog, and extract the current Customer KYC page into one shared submission component consumed by customer and vendor routes.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Supabase, Vitest, next-intl.

## Context and decisions

- New users are not forced to upload IC during signup or vendor registration.
- KYC becomes mandatory at the core-interest boundary: requesting a withdrawal.
- The Vendor Wallet currently relies on a late database rejection and provides no immediate guided recovery.
- The UI preflight improves guidance only; it does not replace `debit_withdrawal` or its database KYC validation.
- Pending and rejected KYC receive distinct explanations and recovery actions.
- Missing or stale verification facts fail closed in the UI.

## Reuse Decisions

| Candidate | Exact path | Decision | Reason |
| --- | --- | --- | --- |
| Capability gate provider/dialog | `components/customer/customer-capability-gate-dialog.tsx` | Reuse | Already supports blocker-specific copy, safe internal recovery paths, and arbitrary KYC route targets. |
| Customer entitlement hook | `components/customer/use-customer-capability-gate.ts` | Reject for vendor eligibility | Its hard guard intentionally excludes vendor roles; using it would conflate customer entitlement policy with vendor withdrawal KYC. |
| Existing KYC submission UI | `app/customer/kyc/page.tsx` | Extract and reuse | The form, upload flow, status handling, and continuation behavior already exist and should remain one implementation. |
| Customer layout provider pattern | `app/customer/layout.tsx` | Reuse in vendor layout | Gives Vendor Wallet access to the existing dialog without duplicating modal state or rendering. |
| Vendor withdrawal RPC | `backend/domains/commerce.ts` and existing Supabase RPC | Reuse unchanged | It remains the authoritative final enforcement and transaction path. |
| New shared KYC component | `components/kyc/kyc-submission-page.tsx` | Create | No suitable shared component exists, and there are two concrete consumers: customer and vendor KYC routes. |

**Reuse audit complete.**

## Scope boundaries

In scope:

- Vendor Wallet preflight for missing, pending, rejected, and approved KYC.
- Recheck at withdrawal submission to prevent bypass through stale open modal state.
- Vendor-specific `/vendor/kyc` route using the same KYC form as customers.
- Existing capability-gate dialog mounted in the vendor portal.
- Focused unit and source-contract tests.

Out of scope:

- Changing KYC approval rules, reviewer workflow, document storage, or Supabase policies.
- Replacing or redesigning the vendor withdrawal RPC.
- Changing customer entitlement role rules.
- Refactoring unrelated wallet or portal components.

Files not being touched:

- `supabase/migrations/**`
- `app/api/kyc/**`
- `app/admin/**`
- Stripe payout/connect implementation files

New dependencies: none.

Database changes: none.

## Task 1: Define and test the Vendor withdrawal KYC decision

**Files:**

- Create: `lib/kyc/vendor-withdrawal-gate.ts`
- Create: `lib/kyc/__tests__/vendor-withdrawal-gate.test.ts`

**Functions:**

- `getVendorWithdrawalKycDecision(verificationFacts)`

**Steps:**

1. Write failing tests for approved, pending, rejected, unverified, and missing verification facts.
2. Assert that blocked decisions expose `/vendor/kyc` as the qualification path and use the existing `wallet.request_withdrawal` capability.
3. Run `npx vitest run lib/kyc/__tests__/vendor-withdrawal-gate.test.ts` and confirm the expected module-not-found failure.
4. Implement the smallest pure decision helper using existing entitlement decision types and blocker codes.
5. Re-run the focused test until green.

## Task 2: Share the existing KYC submission flow with Vendor

**Files:**

- Create: `components/kyc/kyc-submission-page.tsx`
- Modify: `app/customer/kyc/page.tsx`
- Create: `app/vendor/kyc/page.tsx`
- Modify: `messages/en/customer.json`
- Modify: `messages/ms/customer.json`
- Modify: `messages/zh-CN/customer.json`
- Create: `app/vendor/__tests__/kyc-guidance.contract.test.ts`

**Components:**

- `KycSubmissionPage`
- Customer KYC route wrapper
- Vendor KYC route wrapper

**Steps:**

1. Add failing source-contract tests proving both routes use the same shared component and the Vendor route returns to `/vendor/wallet`.
2. Run the focused contract test and confirm it fails before the shared component and Vendor route exist.
3. Move the existing Customer KYC page implementation into `KycSubmissionPage`, parameterizing only its self path, back path, and back-label key.
4. Replace the Customer route with a thin wrapper and add the Vendor route wrapper.
5. Add the Vendor Wallet back label to all three customer locale files.
6. Re-run the contract test and relevant locale parity test until green.

## Task 3: Intercept Vendor Wallet withdrawal attempts

**Files:**

- Modify: `app/vendor/layout.tsx`
- Modify: `app/vendor/wallet/page.tsx`
- Modify: `app/vendor/__tests__/kyc-guidance.contract.test.ts`

**Components/functions:**

- `VendorPortalLayout`
- `VendorWalletPage`
- `openWithdraw`
- withdrawal submit handler KYC precheck

**Steps:**

1. Extend the failing contract test to require the capability-gate provider in Vendor layout and a named KYC precheck before modal opening and submission.
2. Run the focused test and confirm the expected failures.
3. Mount `CustomerCapabilityGateProvider` around the Vendor portal content.
4. Read `verificationFacts` from the existing auth context and call `getVendorWithdrawalKycDecision` before opening the modal.
5. Show the existing capability-gate dialog with `/vendor/kyc` recovery and `/vendor/wallet` continuation when blocked.
6. Repeat the precheck at submit time; preserve the existing RPC and error handling as the final authority.
7. Re-run focused tests until green.

## Task 4: Focused review and verification

**Files:** No intended production changes unless a confirmed must-fix issue is found.

**Steps:**

1. Ask `luna_worker` for one bounded read-only authorization/privacy review of the changed flow, including verification that no KYC document storage paths or signed URLs are newly exposed.
2. Run one focused review after the implementation is ready; classify findings as must-fix or follow-up.
3. Run affected tests:
   - `npx vitest run lib/kyc/__tests__/vendor-withdrawal-gate.test.ts app/vendor/__tests__/kyc-guidance.contract.test.ts`
   - relevant existing KYC, entitlement, and locale parity tests discovered in the repository.
4. Run `npx tsc --noEmit`.
5. Run `npm run lint`.
6. Inspect `git diff --check` and the final scoped diff.

## Risks and mitigations

- **Authorization drift:** UI facts may become stale. Mitigation: repeat the UI check on submit and retain the existing database guard.
- **Role-policy confusion:** Customer entitlement evaluation excludes vendor roles. Mitigation: use a vendor-specific pure KYC decision rather than broadening customer policies.
- **KYC UI divergence:** Two copied forms would drift. Mitigation: one shared component with two thin route wrappers.
- **Unsafe continuation URLs:** Recovery links can carry `next`. Mitigation: retain the existing `postLoginPath` sanitization in the shared form and capability dialog.
- **Localization parity:** A new back label could break locale parity. Mitigation: add the key to all maintained customer locale files and run parity tests.

## Acceptance criteria

- A vendor with approved KYC can open and submit the existing withdrawal modal.
- A vendor with missing KYC sees immediate guidance before the modal opens and can continue to `/vendor/kyc`.
- Pending KYC tells the vendor to wait rather than resubmit.
- Rejected KYC guides the vendor to resubmit.
- A modal opened while approved cannot submit after the local facts become blocked.
- Customer and Vendor KYC routes render the same submission implementation.
- Database withdrawal enforcement remains unchanged.
