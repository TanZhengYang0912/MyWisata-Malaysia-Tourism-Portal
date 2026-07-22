'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

const OUTLET_MANAGER_PATHS = [
  '/vendor/dashboard',
  '/vendor/outlets',
  '/vendor/products',
  '/vendor/bookings',
  '/vendor/orders',
  '/vendor/inbox',
  '/vendor/notifications',
];

export default function VendorAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, user, isOutletManager } = useAuth();
  const allowed = !isOutletManager || OUTLET_MANAGER_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  useEffect(() => {
    if (!loading && user && !allowed) router.replace('/vendor/dashboard');
  }, [allowed, loading, router, user]);

  if (loading || !user || !allowed) return null;
  return children;
}
