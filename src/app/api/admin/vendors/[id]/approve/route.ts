// P2 — Member 2 wires the approve button
// P1 — Member 1 provides auditAndNotify (shared contract)

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { auditAndNotify } from '@/lib/audit';

interface Props { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ data: null, error: { code: 'UNAUTHORIZED', message: '' } }, { status: 401 });

  const { action, reason } = await request.json(); // action: 'approve' | 'reject'
  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ data: null, error: { code: 'INVALID_ACTION', message: '' } }, { status: 400 });
  }

  const { data: before } = await supabase.from('vendors').select('status, owner_id, name').eq('id', id).single();
  if (!before) return NextResponse.json({ data: null, error: { code: 'NOT_FOUND', message: '' } }, { status: 404 });

  const newStatus = action === 'approve' ? 'approved' : 'rejected';
  const { error } = await supabase.from('vendors')
    .update({ status: newStatus, approved_by: user.id, approved_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ data: null, error: { code: 'DB_ERROR', message: error.message } }, { status: 500 });

  await auditAndNotify(
    {
      actorId: user.id,
      action:  `vendor.${action}d`,
      entityType: 'vendor',
      entityId: id,
      beforeData: { status: before.status },
      afterData:  { status: newStatus },
      note: reason ?? undefined,
    },
    [{
      userId: String(before.owner_id),
      type:   `vendor_${action}d`,
      title:  action === 'approve'
        ? `Your vendor "${before.name}" has been approved!`
        : `Your vendor "${before.name}" was rejected`,
      body:   reason ?? undefined,
      link:   '/vendor/dashboard',
    }],
  );

  return NextResponse.json({ data: { status: newStatus }, error: null });
}
