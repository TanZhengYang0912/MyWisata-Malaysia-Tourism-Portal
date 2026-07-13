import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: withdrawalId } = await params;

  const db = await createClient();
  const { data: { user: authUser } } = await db.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let note: string | null = null;
  try {
    const body = await req.json();
    note = body.note ?? null;
  } catch { /* body is optional */ }

  const { error } = await db.rpc('admin_reject_withdrawal', {
    p_withdrawal_id: withdrawalId,
    p_note:          note,
  });

  if (error) {
    const msg = error.message;
    if (msg.includes('admin_required'))            return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    if (msg.includes('self_dealing'))              return NextResponse.json({ error: 'You cannot reject your own withdrawal' }, { status: 403 });
    if (msg.includes('not_found_or_wrong_status')) return NextResponse.json({ error: 'Withdrawal not found or not in pending status' }, { status: 409 });
    console.error('[admin-reject] admin_reject_withdrawal:', error);
    return NextResponse.json({ error: 'Rejection failed' }, { status: 500 });
  }

  return NextResponse.json({ status: 'rejected' });
}
