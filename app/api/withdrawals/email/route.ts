import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enqueueWithdrawalEmail } from '@/lib/email/events';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let withdrawalId: string | null = null;
  try {
    const body = await req.json() as { withdrawal_id?: unknown };
    if (typeof body.withdrawal_id === 'string') withdrawalId = body.withdrawal_id;
  } catch {
    // Invalid/empty body is handled as a bad request below.
  }
  if (!withdrawalId) return NextResponse.json({ error: 'withdrawal_id is required' }, { status: 400 });

  const { data: withdrawal, error } = await db
    .from('withdrawal_requests')
    .select('id, user_id, amount, status')
    .eq('id', withdrawalId)
    .eq('user_id', user.id)
    .single();
  if (error || !withdrawal) return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 });
  if (withdrawal.status !== 'pending') return NextResponse.json({ error: 'Withdrawal is not pending' }, { status: 409 });

  try {
    await enqueueWithdrawalEmail({
      withdrawalId,
      userId: user.id,
      eventType: 'withdrawal_submitted',
      amountRm: Number(withdrawal.amount),
    });
  } catch (emailError) {
    console.error('[withdrawal-email] enqueue failed:', emailError);
    // The withdrawal already succeeded; email is retried from the outbox.
  }

  return NextResponse.json({ queued: true });
}
