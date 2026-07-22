# Withdrawal Review Admin UX Design

## Goal

Make the withdrawal review drawer understandable and safe for an administrator who is unfamiliar with the wallet rules. The page must guide the administrator through selecting a decision, choosing a matching reason, writing a useful note, and confirming the consequences before the request is changed.

## Chosen approach

Use the existing `app/admin/withdrawals/page.tsx` page and its current API contracts. Improve the decision form in place instead of extracting a new component. Keep the existing action values and reason-category enum values for backend compatibility, but present human-readable labels in the UI.

## User flow

1. The drawer shows the withdrawal summary, customer, amount, KYC status, risk, wallet balances, destination, and review evidence.
2. If review evidence is unavailable, the page shows a prominent warning that the administrator should not approve until the data is available. If evidence is available but empty, the page explains that no records were found.
3. The administrator selects one decision: Approve, Hold, Reject, Resume review, or (when permitted) Override high risk.
4. The page then shows only the reason categories valid for that decision. The field label is `Reason for this decision`.
5. The note field displays a decision-specific example and a clear minimum length requirement.
6. Selecting a decision and completing its reason/note shows a confirmation summary before the API request is sent. The summary includes the customer, amount, destination, decision, reason, and note. The administrator can confirm or cancel.
7. On confirmation, the existing endpoint is called with the same payload shape and enum values. Existing success and error feedback remains available.

## Human-readable copy

The UI maps technical reason values to plain-language labels. Examples include:

- `payout_ready`: `Payout details are ready`
- `kyc_or_identity_review`: `KYC or identity needs review`
- `bank_details_mismatch`: `Bank details do not match`
- `risk_review_required`: `Additional risk review required`

Decision descriptions explain the consequence:

- Approve: confirm the review is complete and start payout processing.
- Hold: keep the reserved funds held while more information is requested.
- Reject: reject the request and return the reserved amount to available balance.
- Resume review: continue a request previously placed on hold.

## Evidence states

Review sections must distinguish between an empty result and unavailable review data. The current response shape does not yet expose a dedicated availability flag, so the implementation will use the existing fallback shape and an explicit page-level warning when the fallback is present. This warning must not be presented as proof that the customer has no records.

The approval timeline uses `No decisions recorded yet.` for a new request.

## Validation and safety

- The selected decision determines the available reason categories.
- The client prevents submitting a category that is invalid for the selected decision.
- The note remains limited to 500 characters and requires at least 10 trimmed characters for every decision that requires a reason or note.
- The confirmation step is the final client-side guard before changing the withdrawal.
- Existing server-side validation and moderation remain authoritative.

## Testing

Add regression coverage for the page contract and any extracted pure UI helpers if needed. Tests must verify:

- decision-specific reason labels are present;
- the form uses `Reason for this decision`;
- unavailable evidence copy warns against approval;
- decision-specific note examples exist;
- confirmation copy includes customer, amount, destination, decision, reason, and note;
- technical enum values remain available for API payloads.

Run the focused tests first, then the project lint, TypeScript check, and full test suite before reporting completion.

## Scope exclusions

- No changes to withdrawal API routes or database migrations.
- No changes to wallet balances, reservation, approval, rejection, or payout behavior.
- No changes to the existing approver permissions model.
- No TNG provider implementation in this UX change.
