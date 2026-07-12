# ADR-009: Dual approval threshold at RM 500

**Status:** Accepted

## Decision

Withdrawal requests with `amount >= 500` set `requires_dual_approval = true`, requiring two distinct admin approvers before `record_admin_approval` returns `ready = true` and Stripe is called.

## Rationale

A single-approver path for large withdrawals creates a risk of insider fraud or compromised admin accounts draining vendor earnings. RM 500 was chosen as the threshold because it represents approximately one month of moderate vendor earnings — large enough to warrant a second set of eyes, small enough not to create bottlenecks for typical withdrawals (which average RM 50–200). The dual-approval check is enforced inside the `record_admin_approval` RPC, not in application code, so it cannot be bypassed by a client calling Stripe directly. The same approver cannot approve twice (`withdrawal_approvals` UNIQUE on `(request_id, approver_id, action='approve')`).
