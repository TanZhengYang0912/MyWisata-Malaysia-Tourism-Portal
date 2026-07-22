'use client';

import Link from 'next/link';
import { Bell, Building2 } from 'lucide-react';
import { NotificationBell } from '@/components/shared/notification-bell';
import { useAuth } from '@/hooks/use-auth';

function roleLabel(isOutletManager: boolean, isVendorOwner: boolean) {
  if (isOutletManager) return 'Outlet manager';
  if (isVendorOwner) return 'Vendor owner';
  return 'Vendor team member';
}

/** Shared vendor shell header. The active vendor comes from the authenticated
 * session rather than route parameters, and is passed to the server-authorized
 * notification API by NotificationBell. */
export default function VendorHeader() {
  const { user, loading, isOutletManager, isVendorOwner } = useAuth();
  const vendorId = user?.activeVendorId ?? null;

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="flex min-h-16 items-center justify-between gap-4 px-6">
        <Link href="/vendor/dashboard" className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
            <Building2 size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-gray-950">Vendor Portal</span>
            <span className="block truncate text-xs text-gray-500">
              {loading ? 'Loading workspace…' : roleLabel(isOutletManager, isVendorOwner)}
              {user?.activeOutletName ? ` · ${user.activeOutletName}` : ''}
            </span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-3">
          {!loading && vendorId ? (
            <NotificationBell scope="vendor" vendorId={vendorId} allHref="/vendor/notifications" />
          ) : (
            <span aria-hidden="true" className="rounded-lg p-1.5 text-gray-300"><Bell size={18} /></span>
          )}
          <span className="hidden text-xs font-semibold uppercase tracking-[0.14em] text-gray-400 sm:inline">Vendor workspace</span>
        </div>
      </div>
    </header>
  );
}
