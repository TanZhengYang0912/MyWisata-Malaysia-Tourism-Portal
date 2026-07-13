import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/admin/clear-earnings
 *
 * Admin-triggered clearance. Uses the request's Supabase session cookie —
 * confirm_pending_earnings() enforces is_admin(auth.uid()) internally.
 */
export async function POST() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('confirm_pending_earnings');

  if (error) {
    const status = error.message.includes('admin_required') ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ confirmed: data });
}
