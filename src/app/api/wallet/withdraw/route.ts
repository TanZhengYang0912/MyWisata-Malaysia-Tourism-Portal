// P-TMF — Customer submits withdrawal request
// POST /api/wallet/withdraw
//   Body: { amount, destinationId? }
//   Auth: KYC-approved user (enforced inside submit_withdrawal RPC)
//   Transaction: submit_withdrawal RPC locks wallet, reserves funds atomically

import { createClient } from '@/lib/supabase/server';
import { withdrawalSubmitSchema, parseBody, apiFail } from '@/lib/validation/schemas';
import { withIdempotency } from '@/lib/idempotency';
import { recordAudit } from '@/lib/audit';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', '', 401);

  const parsed = await parseBody(request, withdrawalSubmitSchema);
  if (!parsed.ok) return parsed.response;

  // Money-writing endpoint — idempotency STRONGLY recommended
  const idem = await withIdempotency(request, user.id, '/api/wallet/withdraw', parsed.data);
  if (idem.replayed) return idem.replayed;

  const { data: result, error } = await supabase.rpc('submit_withdrawal', {
    p_user_id:        user.id,
    p_amount:         parsed.data.amount,
    p_destination_id: parsed.data.destinationId ?? null,
  });

  if (error) {
    // Map known PG exceptions to friendly codes
    if (error.message.includes('KYC')) {
      return apiFail('KYC_REQUIRED', 'KYC must be approved before withdrawal', 403);
    }
    if (error.message.includes('Insufficient')) {
      return apiFail('INSUFFICIENT_BALANCE', error.message, 400);
    }
    return apiFail('RPC_ERROR', error.message, 500);
  }

  await recordAudit({
    actorId:    user.id,
    action:     'withdrawal.requested',
    entityType: 'withdrawal_request',
    entityId:   result.request_id,
    afterData:  { amount: parsed.data.amount, requires_dual_approval: result.requires_dual_approval },
  });

  return idem.record({ data: result, error: null }, 201);
}
