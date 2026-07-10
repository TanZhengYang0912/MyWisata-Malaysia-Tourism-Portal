// P4 — Member 4 owns D4 withdrawal approval flow
// P1 — Member 1 provides auditAndNotify

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { onWithdrawalReviewed } from '@/lib/domain-events';

interface Props { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: '' } }, { status: 401 });

  const { action, note } = await request.json(); // action: 'approve' | 'reject' | 'hold'
  if (!['approve', 'reject', 'hold'].includes(action)) {
    return NextResponse.json({ data: null, error: { code: 'INVALID_ACTION', message: '' } }, { status: 400 });
  }

  const { data: req } = await supabase
    .from('withdrawal_requests')
    .select('*, wallets(id, user_id)')
    .eq('id', id)
    .single();
  if (!req) return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message: '' } }, { status: 404 });

  const wallet = req.wallets as Record<string, unknown>;
  const walletId = String(wallet.id);
  const ownerId  = String(wallet.user_id);

  // Record approval action
  await supabase.from('withdrawal_approvals').insert({
    request_id:  id,
    approver_id: user.id,
    action,
    note: note ?? null,
  });

  if (action === 'approve') {
    const newStatus = req.requires_dual_approval
      ? // Check if already has one approval
        ((await supabase.from('withdrawal_approvals').select('id').eq('request_id', id).eq('action', 'approve')).data?.length ?? 0) >= 2
          ? 'completed'
          : 'pending'
      : 'completed';

    await supabase.from('withdrawal_requests').update({ status: newStatus }).eq('id', id);

    if (newStatus === 'completed') {
      // Debit wallet ledger (reserve was already made on request creation)
      await supabase.from('wallet_ledger').insert({
        wallet_id:    walletId,
        entry_type:   'withdrawal_complete',
        amount:       -Number(req.amount),
        balance_type: 'available',
        reference_id: id,
        note:         'Withdrawal completed',
      });
    }
  } else {
    // reject or hold
    await supabase.from('withdrawal_requests').update({ status: action === 'reject' ? 'rejected' : 'pending' }).eq('id', id);
    if (action === 'reject') {
      // Release reserved funds back to available
      await supabase.from('wallet_ledger').insert({
        wallet_id:    walletId,
        entry_type:   'withdrawal_release',
        amount:       Number(req.amount),
        balance_type: 'available',
        reference_id: id,
        note:         `Withdrawal rejected: ${note ?? ''}`,
      });
    }
  }

  await onWithdrawalReviewed(id, user.id, ownerId, action === 'approve');
  return NextResponse.json({ data: { action }, error: null });
}
