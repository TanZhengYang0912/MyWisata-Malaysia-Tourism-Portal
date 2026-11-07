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
  '/vendor/announcements',
  '/vendor/analytics',
];

// Event vendors sell only at events: event registration, invitations and payouts.
const EVENT_VENDOR_PATHS = [
  '/vendor/events',
  '/vendor/event-orders',
  '/vendor/scanner',
  '/vendor/announcements',
  '/vendor/wallet',
];

const onPath = (pathname: string, paths: string[]) => paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));

export default function VendorAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, user, isVendor, isVendorOwner, isOutletManager, isEventVendor } = useAuth();
  const isScannerRoute = pathname === '/vendor/scanner' || pathname.startsWith('/vendor/scanner/');
  const allowed = isVendorOwner
    || (isOutletManager && onPath(pathname, OUTLET_MANAGER_PATHS))
    || (isEventVendor && onPath(pathname, EVENT_VENDOR_PATHS));

  useEffect(() => {
    if (!loading && !allowed) {
      const destination = !user
        ? '/login'
        : !isVendor
          ? '/customer'
          : isEventVendor
            ? '/vendor/announcements'
            : isScannerRoute
            ? '/vendor/outlets'
            : '/vendor/announcements';
      router.replace(destination);
    }
  }, [allowed, isEventVendor, isScannerRoute, isVendor, loading, router, user]);

  if (loading || !user || !allowed) return null;
  return children;
}
