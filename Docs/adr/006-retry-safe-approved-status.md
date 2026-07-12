# ADR-006: status='approved' persists through Stripe failure (retry-safe design)

**Status:** Accepted

## Decision

`record_admin_approval` sets `withdrawal_requests.status = 'approved'` before the Stripe API is called. If Stripe fails, the status stays `'approved'` and the admin sees a "Retry Stripe" button. The earnings remain debited. Only a successful Stripe call advances status to `'processing'`.

## Rationale

The alternative — setting status to `'pending'` on Stripe failure — would hide the admin's approval decision and require a second approval round-trip, which could violate dual-approval accounting (the second approver would be approving for the first time, not acknowledging a prior decision). By keeping `'approved'` as a stable intermediate state, the admin can retry Stripe without re-entering the approval workflow, and the audit log (`withdrawal_approvals` table) already records who approved and when. The vendor's earnings stay debited throughout to prevent them from submitting a second withdrawal for funds already committed to processing.
