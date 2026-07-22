import { createServiceClient } from '@/lib/supabase/service';
import { moderateWalletReason } from '@/lib/moderation';
import type { WalletReasonAction } from '@/lib/validation/wallet-reason-schemas';

type GuardInput = {
  actorId: string;
  withdrawalId?: string;
  action: WalletReasonAction;
  reasonCategory: string;
  reason: string;
};

export type WalletModerationGuardResult =
  | { ok: true; categories: string[] }
  | { ok: false; code: 'RATE_LIMITED' | 'MODERATION_UNAVAILABLE' | 'CONTENT_REJECTED' | 'IRRELEVANT'; message: string };

async function recordAttempt(input: GuardInput, result: 'accepted' | 'flagged' | 'irrelevant' | 'unavailable' | 'invalid', categories: string[]) {
  try {
    await createServiceClient().from('wallet_moderation_attempts').insert({
      actor_id: input.actorId,
      withdrawal_id: input.withdrawalId ?? null,
      action: input.action,
      reason_category: input.reasonCategory,
      result,
      model_categories: categories,
    });
  } catch (error) {
    console.error('[wallet-moderation] attempt audit failed', error);
  }
}

export async function moderateWalletAction(input: GuardInput): Promise<WalletModerationGuardResult> {
  const db = createServiceClient();
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  let rateQuery = db
    .from('wallet_moderation_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('actor_id', input.actorId)
    .eq('action', input.action)
    .gte('created_at', since);
  rateQuery = input.withdrawalId ? rateQuery.eq('withdrawal_id', input.withdrawalId) : rateQuery.is('withdrawal_id', null);
  const { count, error: countError } = await rateQuery;
  if (countError) {
    console.error('[wallet-moderation] rate-limit lookup failed', countError);
    return { ok: false, code: 'MODERATION_UNAVAILABLE', message: 'Content review is temporarily unavailable; please try again.' };
  }
  if ((count ?? 0) >= 5) {
    return { ok: false, code: 'RATE_LIMITED', message: 'Too many review attempts. Please wait 10 minutes and try again.' };
  }

  const result = await moderateWalletReason(input.reason, input.action, input.reasonCategory);
  if ('error' in result) {
    await recordAttempt(input, 'unavailable', []);
    return { ok: false, code: 'MODERATION_UNAVAILABLE', message: 'Content review is temporarily unavailable; please try again.' };
  }
  if (result.flagged) {
    await recordAttempt(input, 'flagged', result.categories);
    return { ok: false, code: 'CONTENT_REJECTED', message: `Reason rejected by Wallet policy${result.categories.length ? `: ${result.categories.join(', ')}` : '.'}` };
  }
  if (!result.relevant) {
    await recordAttempt(input, 'irrelevant', result.categories);
    return { ok: false, code: 'IRRELEVANT', message: 'Please provide a clear reason relevant to the selected Wallet action and category.' };
  }
  await recordAttempt(input, 'accepted', result.categories);
  return { ok: true, categories: result.categories };
}
