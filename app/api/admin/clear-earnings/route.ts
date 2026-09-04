import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';

/**
 * POST /api/admin/clear-earnings
 *
 * Admin-triggered clearance. Uses the request's Supabase session cookie —
 * The API requires Super Admin independently of the legacy RPC role check.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (!(await isSuperAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Super Admin role required' }, { status: 403 });
  }
  const { data, error } = await supabase.rpc('confirm_pending_earnings');

  if (error) {
    const status = error.message.includes('admin_required') ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ confirmed: data });
}
