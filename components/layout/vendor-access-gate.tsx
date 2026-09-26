'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

const OUTLET_MANAGER_PATHS = [
  '/vendor/dashboard',
  '/vendor/outlets',
  '/vendor/products',
  '/vendor/bookings',
  '/vendor/scanner',
  '/vendor/vouchers',
  '/vendor/orders',
  '/vendor/inbox',
  '/vendor/analytics',
];

export default function VendorAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, user, isVendor, isVendorOwner, isOutletManager } = useAuth();
  const isScannerRoute = pathname === '/vendor/scanner' || pathname.startsWith('/vendor/scanner/');
  const allowed = isVendorOwner || (isOutletManager && OUTLET_MANAGER_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  ));

  useEffect(() => {
    if (!loading && !allowed) {
      const destination = !user
        ? '/login'
        : !isVendor
          ? '/customer'
          : isScannerRoute
            ? '/vendor/outlets'
            : '/vendor/dashboard';
      router.replace(destination);
    }
  }, [allowed, isScannerRoute, isVendor, loading, router, user]);

  if (loading || !user || !allowed) return null;
  return children;
}
