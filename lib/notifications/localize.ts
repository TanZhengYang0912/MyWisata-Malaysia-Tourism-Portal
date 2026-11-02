import { KYC_SECURITY_KINDS, type KycSecurityKind } from '@/lib/kyc/types';

export type NotificationMetadata = Record<string, unknown>;

export type NotificationForLocalization = {
  type?: string;
  title: string;
  body: string;
  metadata?: NotificationMetadata;
};

export type NotificationTranslator = (key: string, options?: Record<string, unknown>) => string;

type NotificationTemplate = {
  title: string;
  body?: string;
};

const TEMPLATES: Record<string, NotificationTemplate> = {
  vendor_approved: { title: 'notifications.events.vendorLifecycle.approved.title', body: 'notifications.events.vendorLifecycle.approved.body' },
  vendor_information_requested: { title: 'notifications.events.vendorLifecycle.informationRequested.title' },
  vendor_rejected: { title: 'notifications.events.vendorLifecycle.rejected.title' },
  vendor_suspended: { title: 'notifications.events.vendorLifecycle.suspended.title' },
  vendor_unsuspended: { title: 'notifications.events.vendorLifecycle.reactivated.title', body: 'notifications.events.vendorLifecycle.reactivated.body' },
  vendor_event_exception_payment_blocked: { title: 'notifications.events.eventException.payment_blocked.title', body: 'notifications.events.eventException.payment_blocked.body' },
  vendor_event_exception_pickup_review: { title: 'notifications.events.eventException.pickup_review.title', body: 'notifications.events.eventException.pickup_review.body' },
  vendor_event_exception_refund_pending: { title: 'notifications.events.eventException.refund_pending.title', body: 'notifications.events.eventException.refund_pending.body' },
  vendor_event_exception_refund_attention: { title: 'notifications.events.eventException.refund_attention.title', body: 'notifications.events.eventException.refund_attention.body' },
  vendor_event_exception_refunded: { title: 'notifications.events.eventException.refunded.title', body: 'notifications.events.eventException.refunded.body' },
  vendor_event_exception_collected: { title: 'notifications.events.eventException.collected.title', body: 'notifications.events.eventException.collected.body' },
  vendor_event_exception_no_show: { title: 'notifications.events.eventException.no_show.title', body: 'notifications.events.eventException.no_show.body' },
  withdrawal_approved: { title: 'notifications.events.withdrawalApproved.title', body: 'notifications.events.withdrawalApproved.body' },
  withdrawal_second_approval_pending: { title: 'notifications.events.withdrawalSecondApprovalPending.title', body: 'notifications.events.withdrawalSecondApprovalPending.body' },
  withdrawal_submitted: { title: 'notifications.events.withdrawalSubmitted.title', body: 'notifications.events.withdrawalSubmitted.body' },
  withdrawal_approval_task: { title: 'notifications.events.withdrawalApprovalTask.title', body: 'notifications.events.withdrawalApprovalTask.body' },
  withdrawal_approval_step_completed: { title: 'notifications.events.withdrawalApprovalStepCompleted.title', body: 'notifications.events.withdrawalApprovalStepCompleted.body' },
  withdrawal_approval_resolved: { title: 'notifications.events.withdrawalApprovalResolved.title', body: 'notifications.events.withdrawalApprovalResolved.body' },
  withdrawal_approval_cycle_restarted: { title: 'notifications.events.withdrawalApprovalCycleRestarted.title', body: 'notifications.events.withdrawalApprovalCycleRestarted.body' },
  withdrawal_approval_unavailable: { title: 'notifications.events.withdrawalApprovalUnavailable.title', body: 'notifications.events.withdrawalApprovalUnavailable.body' },
  withdrawal_paid: { title: 'notifications.events.withdrawalPaid.title', body: 'notifications.events.withdrawalPaid.body' },
  withdrawal_failed: { title: 'notifications.events.withdrawalFailed.title', body: 'notifications.events.withdrawalFailed.body' },
  withdrawal_risk_reviewed: { title: 'notifications.events.withdrawalRiskReviewed.title', body: 'notifications.events.withdrawalRiskReviewed.body' },
  withdrawal_overdue: { title: 'notifications.events.withdrawalOverdue.title', body: 'notifications.events.withdrawalOverdue.body' },
  withdrawal_resumed: { title: 'notifications.events.withdrawalResumed.title', body: 'notifications.events.withdrawalResumed.body' },
  withdrawal_rejected: { title: 'notifications.events.withdrawalRejected.title' },
  withdrawal_hold: { title: 'notifications.events.withdrawalHold.title' },
  wallet_adjustment: { title: 'notifications.events.walletAdjustment.title', body: 'notifications.events.walletAdjustment.body' },
  wallet_refund: { title: 'notifications.events.walletRefund.title', body: 'notifications.events.walletRefund.body' },
  recommendation_approved: { title: 'notifications.events.recommendationApprovedWithName.title', body: 'notifications.events.recommendationApprovedWithName.body' },
  chat_message: { title: 'notifications.events.chatMessage.title', body: 'notifications.events.chatMessage.body' },
};

function safeMetadata(metadata: NotificationMetadata | undefined) {
  if (!metadata) return {};
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)),
  );
}

export function localizeNotification(
  notification: NotificationForLocalization,
  translate: NotificationTranslator,
) {
  if (notification.type === 'kyc_security_alert') {
    const kind = notification.metadata?.kind;
    const count = notification.metadata?.count;
    return {
      title: translate('notifications.events.kycSecurity.title'),
      body: typeof kind === 'string' && KYC_SECURITY_KINDS.includes(kind as KycSecurityKind)
        ? translate(`notifications.events.kycSecurity.${kind}`, { count: typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count : 0 })
        : translate('notifications.events.kycSecurity.generic'),
    };
  }
  const template = notification.type ? TEMPLATES[notification.type] : undefined;
  if (!template) return { title: notification.title, body: notification.body };

  const metadata = safeMetadata(notification.metadata);

  if (
    ['vendor_approved', 'vendor_information_requested', 'vendor_rejected', 'vendor_suspended', 'vendor_unsuspended'].includes(notification.type ?? '')
    && typeof metadata.vendorName !== 'string'
  ) {
    return { title: notification.title, body: notification.body };
  }

  // Legacy recommendation rows only have an already-rendered English title.
  // Keep that title until the producer starts supplying the vendor name as data;
  // parsing user text to recover a name would be brittle and unsafe.
  if (
    notification.type === 'recommendation_approved' &&
    (typeof metadata.vendorName !== 'string' || metadata.vendorName.trim().length === 0)
  ) {
    return { title: notification.title, body: notification.body };
  }

  // `withdrawal_submitted` is also used for the approver inbox. That variant
  // contains review-specific dynamic content and must not be replaced with the
  // customer-facing status copy.
  if (
    notification.type === 'withdrawal_submitted' &&
    typeof metadata.withdrawal_id === 'string' &&
    metadata.approval_cycle !== undefined
  ) {
    return { title: notification.title, body: notification.body };
  }

  if (notification.type === 'chat_message') {
    return {
      title: translate('notifications.events.chatMessage.title', metadata),
      body: metadata.attachment === true
        ? translate('notifications.events.chatMessage.attachmentBody', metadata)
        : (typeof metadata.preview === 'string' && metadata.preview.length > 0 ? metadata.preview : notification.body),
    };
  }

  if (notification.type === 'vendor_information_requested' || notification.type === 'vendor_rejected' || notification.type === 'vendor_suspended') {
    return { title: translate(template.title, metadata), body: notification.body };
  }

  return {
    title: translate(template.title, metadata),
    body: template.body ? translate(template.body, metadata) : notification.body,
  };
}
