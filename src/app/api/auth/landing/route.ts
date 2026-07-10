// P1 — Landing page resolver for post-login redirect.
// Uses get_my_roles() RPC (SECURITY DEFINER) to sidestep RLS-eval issues
// when joining user_roles + roles under the anon token.

import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return Response.json({ landing: '/login' });

  const { data: roleRows, error } = await supabase.rpc('get_my_roles');

  if (error) console.error('[landing] get_my_roles failed:', error);

  const roles = (roleRows ?? []).map((r: { role_name: string }) => r.role_name);

  let landing = '/discovery';
  if (roles.includes('super_admin') || roles.includes('approver')) {
    landing = '/admin/dashboard';
  } else if (roles.includes('vendor_owner') || roles.includes('outlet_manager')) {
    landing = '/vendor/dashboard';
  }

  return Response.json({ landing, roles });
}
