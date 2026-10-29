/** One predicate for list/count and both read mutations. Owner checks stay on callers. */
export const STAFF_NOTIFICATION_TYPES = 'withdrawal_overdue,withdrawal_approval_task,withdrawal_approval_cycle_restarted,withdrawal_approval_resolved,withdrawal_approval_step_completed,withdrawal_approval_unavailable';
export const STAFF_NOTIFICATION_FILTER = `type.in.(${STAFF_NOTIFICATION_TYPES}),and(type.eq.withdrawal_submitted,link.like./admin/withdrawals*,metadata->>withdrawal_id.not.is.null)`;
export const CUSTOMER_LEGACY_NOTIFICATION_FILTER = 'type.neq.withdrawal_submitted,link.is.null,link.not.like./admin/withdrawals*,metadata->>withdrawal_id.is.null';
