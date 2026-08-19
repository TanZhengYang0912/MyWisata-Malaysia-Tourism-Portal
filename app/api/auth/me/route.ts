import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { AuthUser } from '@/types';
import type { RoleName } from '@/lib/constants';
import { isEmailVerified } from '@/lib/verification/email-status';

export const dynamic = 'force-dynamic';

type RoleRow = {
  vendor_id: string | null;
  outlet_id: string | null;
  roles?: { name: RoleName } | { name: RoleName }[] | null;
  outlets?: { vendor_id: string | null; name?: string | null } | { vendor_id: string | null; name?: string | null }[] | null;
};

type ManagerAssignmentRow = {
  outlet_id: string;
  outlets?: { vendor_id: string | null; name?: string | null } | { vendor_id: string | null; name?: string | null }[] | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  kyc_status: string | null;
  tier: string | null;
  email_verified_at: string | null;
  phone_verified_at: string | null;
  profile_completed_at: string | null;
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }, { data: managerRows, error: managerError }] = await Promise.all([
    supabase.from('users').select('id,email,full_name,avatar_url,kyc_status,tier,email_verified_at,phone_verified_at,profile_completed_at').eq('id', authUser.id).maybeSingle(),
    supabase.from('user_roles').select('vendor_id,outlet_id,roles(name),outlets(vendor_id,name)').eq('user_id', authUser.id),
    supabase.from('outlet_managers').select('outlet_id,outlets(vendor_id,name)').eq('user_id', authUser.id),
  ]);
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (rolesError) return NextResponse.json({ error: rolesError.message }, { status: 500 });
  if (managerError) return NextResponse.json({ error: managerError.message }, { status: 500 });

  const profileRow = profile as ProfileRow | null;
  const rows = (roleRows || []) as RoleRow[];
  const roles = rows.map((row) => {
    const role = Array.isArray(row.roles) ? row.roles[0] : row.roles;
    return role?.name;
  }).filter((role): role is RoleName => Boolean(role));
  const managerAssignments = (managerRows || []) as ManagerAssignmentRow[];
  const vendorIds = [...new Set([
    ...rows.flatMap((row) => {
      const outlet = Array.isArray(row.outlets) ? row.outlets[0] : row.outlets;
      return [row.vendor_id, outlet?.vendor_id];
    }),
    ...managerAssignments.map((row) => {
      const outlet = Array.isArray(row.outlets) ? row.outlets[0] : row.outlets;
      return outlet?.vendor_id;
    }),
  ].filter((id): id is string => Boolean(id)))];
  const outletIds = [...new Set(managerAssignments.map((row) => row.outlet_id))];
  const assignedOutletRelation = managerAssignments[0] ? (Array.isArray(managerAssignments[0].outlets) ? managerAssignments[0].outlets[0] : managerAssignments[0].outlets) : null;

  return NextResponse.json({
    user: {
      id: authUser.id,
      email: authUser.email || profileRow?.email || '',
      fullName: profileRow?.full_name || null,
      avatarUrl: profileRow?.avatar_url || null,
      kycStatus: profileRow?.kyc_status || 'unverified',
      tier: profileRow?.tier || 'email_unverified',
      emailVerified: isEmailVerified(authUser.email_confirmed_at, profileRow?.email_verified_at, authUser.identities),
      phoneVerified: Boolean(profileRow?.phone_verified_at),
      profileComplete: Boolean(profileRow?.profile_completed_at),
      roles,
      activeVendorId: vendorIds[0] || null,
      activeOutletIds: outletIds,
      activeOutletName: assignedOutletRelation?.name || null,
    },
  });
}
