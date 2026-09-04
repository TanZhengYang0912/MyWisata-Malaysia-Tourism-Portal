'use client';

import { useAuth as useProviderAuth } from '@/components/providers/auth';
import type { AuthUser } from '@/types';

export function useAuth() {
  const { currentUser, roles, activeVendorId, activeOutletIds, activeOutletName, verificationFacts, loading } = useProviderAuth();
  const user: AuthUser | null = currentUser ? {
    id: currentUser.id,
    email: currentUser.email,
    fullName: currentUser.name,
    avatarUrl: null,
    kycStatus: verificationFacts?.kycStatus ?? 'unverified',
    emailVerified: verificationFacts?.emailVerified ?? false,
    phoneVerified: verificationFacts?.phoneVerified ?? false,
    profileComplete: verificationFacts?.profileComplete ?? false,
    roles: roles as AuthUser['roles'],
    activeVendorId: activeVendorId ?? null,
    activeOutletIds: activeOutletIds ?? [],
    activeOutletName,
  } : null;

  const isAdmin = user?.roles.includes('super_admin') ?? false;
  const isApprover = user?.roles.includes('approver') ?? false;
  const isVendorOwner = user?.roles.includes('vendor_owner') ?? false;
  const isOutletManager = user?.roles.includes('outlet_manager') ?? false;
  const isVendor = isVendorOwner || isOutletManager;
  const isKyc = user?.kycStatus === 'approved';
  const canEarn = isKyc && !!user?.profileComplete;

  return { user, loading, isAdmin, isApprover, isVendor, isVendorOwner, isOutletManager, isKyc, canEarn };
}
