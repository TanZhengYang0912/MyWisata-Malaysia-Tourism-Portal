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
  '/vendor/notifications',
  '/vendor/analytics',
];

export default function VendorAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, user, isOutletManager } = useAuth();
  const isScannerRoute = pathname === '/vendor/scanner' || pathname.startsWith('/vendor/scanner/');
  const allowed = !isOutletManager
    ? !isScannerRoute
    : OUTLET_MANAGER_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  useEffect(() => {
    if (!loading && user && !allowed) {
      router.replace(isScannerRoute ? '/vendor/outlets' : '/vendor/dashboard');
    }
  }, [allowed, isScannerRoute, loading, router, user]);

  if (loading || !user || !allowed) return null;
  return children;
}
