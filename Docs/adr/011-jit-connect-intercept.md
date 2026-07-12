# ADR-011: JIT Connect account check on Withdraw button

**Status:** Accepted

## Decision

Clicking the Withdraw button does not open a form immediately. It first checks `connectStatus` (derived from `getConnectStatus` called on page load) and shows a "Bank account required" modal if the user has no verified Connect account, rather than surfacing a 422 API error after form submission.

## Rationale

Showing the withdrawal form to a user who cannot complete a withdrawal sets a false expectation. The user fills the form, submits, gets an error, and loses the work. The JIT (just-in-time) check converts a disruptive post-submit error into a proactive gate that explains the next action (start Connect onboarding). The status is fetched once on wallet page load and stored in component state, so the button-click check is synchronous — no extra network round-trip at click time. The API endpoint still enforces the 422 independently, so the UI gate is UX, not security.
