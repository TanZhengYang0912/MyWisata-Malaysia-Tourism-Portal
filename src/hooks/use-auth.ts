'use client';
// P1 — Member 1 owns this hook (A1 Auth/RBAC)

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AuthUser } from '@/types';
import type { RoleName } from '@/lib/constants';

export function useAuth() {
  const supabase = createClient();
  const [user,    setUser]    = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { setUser(null); setLoading(false); return; }

      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('roles(name), vendor_id, outlet_id')
        .eq('user_id', authUser.id);

      const roles = (roleRows ?? []).map(
        r => (r.roles as Record<string, unknown>)?.name as RoleName,
      ).filter(Boolean);

      const vendorIds = [...new Set((roleRows ?? []).map(r => r.vendor_id).filter(Boolean) as string[])];
      const outletIds = [...new Set((roleRows ?? []).map(r => r.outlet_id).filter(Boolean) as string[])];

      setUser({
        id:              authUser.id,
        email:           authUser.email ?? '',
        fullName:        profile?.full_name ?? null,
        avatarUrl:       profile?.avatar_url ?? null,
        kycStatus:       profile?.kyc_status ?? 'unverified',
        emailVerified:   !!profile?.email_verified_at,
        phoneVerified:   !!profile?.phone_verified_at,
        profileComplete: !!profile?.profile_completed_at,
        roles,
        activeVendorId:  vendorIds[0] ?? null,
        activeOutletIds: outletIds,
      });
      setLoading(false);
    }

    loadUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => loadUser());
    return () => subscription.unsubscribe();
  }, [supabase]);

  const isAdmin    = user?.roles.includes('super_admin') ?? false;
  const isApprover = user?.roles.includes('approver')    ?? false;
  const isVendor   = user?.roles.includes('vendor_owner') || user?.roles.includes('outlet_manager') ? true : false;
  const isKyc      = user?.kycStatus === 'approved';
  const canEarn    = isKyc && !!user?.profileComplete;

  return { user, loading, isAdmin, isApprover, isVendor, isKyc, canEarn };
}
