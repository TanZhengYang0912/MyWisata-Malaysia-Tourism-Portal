// ── Domain Event Contracts ───────────────────────────────────
// These are the 5 cross-module events defined in the module plan.
// Each handler is called after the DB write — they are side effects only.

import { auditAndNotify } from '@/lib/audit';

export async function onOrderPaid(orderId: string, customerId: string) {
  await auditAndNotify(
    { actorId: customerId, action: 'order.paid', entityType: 'order', entityId: orderId },
    [{ userId: customerId, type: 'order_paid', title: 'Payment confirmed!', link: `/orders/${orderId}` }],
  );
}

export async function onOrderCompleted(orderId: string, customerId: string) {
  await auditAndNotify(
    { actorId: customerId, action: 'order.completed', entityType: 'order', entityId: orderId },
    [{ userId: customerId, type: 'order_completed', title: 'Order completed — leave a review!', link: `/orders/${orderId}` }],
  );
}

export async function onWithdrawalReviewed(
  requestId: string,
  approverId: string,
  ownerId: string,
  approved: boolean,
) {
  const action = approved ? 'withdrawal.approved' : 'withdrawal.rejected';
  await auditAndNotify(
    { actorId: approverId, action, entityType: 'withdrawal_request', entityId: requestId },
    [{
      userId: ownerId,
      type: approved ? 'withdrawal_approved' : 'withdrawal_rejected',
      title: approved ? 'Withdrawal approved!' : 'Withdrawal rejected',
      link: '/wallet',
    }],
  );
}

export async function onRecommendationConverted(
  recommendationId: string,
  recommenderId: string,
  adminId: string,
) {
  await auditAndNotify(
    { actorId: adminId, action: 'recommendation.converted', entityType: 'vendor_recommendation', entityId: recommendationId },
    [{
      userId: recommenderId,
      type: 'recommendation_converted',
      title: 'Your recommendation was approved — you earned a bonus!',
      link: '/wallet',
    }],
  );
}
