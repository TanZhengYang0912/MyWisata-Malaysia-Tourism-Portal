import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { isRecommendationRewardAdmin } from '@/lib/recommendations/admin-guard';
import { enqueueUserTransactionEmail } from '@/lib/email/events';
import { clearMaturedRecommendationRewards } from '@/lib/recommendations/reward-clearing';

async function notifyRewardLifecycle(
  service: ReturnType<typeof createServiceClient>,
  reward: { commissionId: string; userId: string; amountSen: number },
  action: 'available' | 'reversed',
) {
  const amountRm = reward.amountSen / 100;
  const available = action === 'available';
  const title = available ? 'Your recommendation reward is now available' : 'Your pending recommendation reward was reversed';
  const body = available
    ? `RM ${amountRm.toFixed(2)} is now available in your wallet after the 7-day hold and KYC approval.`
    : `RM ${amountRm.toFixed(2)} was reversed because the related order was cancelled or refunded.`;

  const notification = service.from('notifications').insert({
    user_id: reward.userId,
    type: available ? 'recommendation_reward_available' : 'recommendation_reward_reversed',
    title,
    body,
    link: '/customer/wallet',
  });
  const email = enqueueUserTransactionEmail({
    userId: reward.userId,
    eventType: available ? 'recommendation_reward_available' : 'recommendation_reward_reversed',
    eventKey: `${available ? 'recommendation_reward_available' : 'recommendation_reward_reversed'}:${reward.commissionId}`,
    reference: 'Recommendation reward',
    amountRm,
  });

  const [notificationResult, emailResult] = await Promise.allSettled([notification, email]);
  if (notificationResult.status === 'rejected') {
    console.error('[recommendation-reward-clearing] notification failed', notificationResult.reason);
  }
  if (emailResult.status === 'rejected') {
    console.error('[recommendation-reward-clearing] email enqueue failed', emailResult.reason);
  }
}

/** Manual clearing entry point. Scheduled jobs may use the same database RPC,
 * but browser callers must prove their Admin / Approver role before a service
 * client is created. */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isRecommendationRewardAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only an Admin or Super Admin can run reward clearing', 403);
  }

  const service = createServiceClient();
  try {
    const result = await clearMaturedRecommendationRewards(service);
    await Promise.all([
      ...result.cleared.map((reward) => notifyRewardLifecycle(service, reward, 'available')),
      ...result.reversed.map((reward) => notifyRewardLifecycle(service, reward, 'reversed')),
    ]);
    return apiOk(result);
  } catch (error) {
    console.error('[recommendation-reward-clearing] failed', error);
    return apiFail('REWARD_CLEARING_FAILED', 'Unable to clear recommendation rewards', 500);
  }
}
