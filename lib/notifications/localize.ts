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
  withdrawal_approved: { title: 'notifications.events.withdrawalApproved.title', body: 'notifications.events.withdrawalApproved.body' },
  withdrawal_second_approval_pending: { title: 'notifications.events.withdrawalSecondApprovalPending.title', body: 'notifications.events.withdrawalSecondApprovalPending.body' },
  withdrawal_submitted: { title: 'notifications.events.withdrawalSubmitted.title', body: 'notifications.events.withdrawalSubmitted.body' },
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
  const template = notification.type ? TEMPLATES[notification.type] : undefined;
  if (!template) return { title: notification.title, body: notification.body };

  const metadata = safeMetadata(notification.metadata);

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

  return {
    title: translate(template.title, metadata),
    body: template.body ? translate(template.body, metadata) : notification.body,
  };
}
