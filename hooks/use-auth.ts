'use client';
// P1 — Member 1 owns this hook (A1 Auth/RBAC)

import { useEffect, useState } from 'react';
import type { AuthUser } from '@/types';

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!response.ok) {
          if (active) setUser(null);
          return;
        }
        const payload = await response.json() as { user: AuthUser };
        if (active) setUser(payload.user);
      } catch {
        if (active) setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadUser();
    return () => { active = false; };
  }, []);

  const isAdmin = user?.roles.includes('super_admin') ?? false;
  const isApprover = user?.roles.includes('approver') ?? false;
  const isVendor = user?.roles.includes('vendor_owner') || user?.roles.includes('outlet_manager') ? true : false;
  const isKyc = user?.kycStatus === 'approved';
  const canEarn = isKyc && !!user?.profileComplete;

  return { user, loading, isAdmin, isApprover, isVendor, isKyc, canEarn };
}
