'use client';

import { NotificationCenter } from '@/components/shared/notification-center';
import { useAuth } from '@/hooks/use-auth';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'vendor_orders', label: 'Orders' },
  { value: 'vendor_bookings', label: 'Bookings' },
  { value: 'vendor_products', label: 'Products' },
  { value: 'vendor_wallet', label: 'Wallet' },
  { value: 'vendor_account', label: 'Account' },
];

export default function VendorNotificationsPage() {
  const { user, loading, isVendor } = useAuth();

  if (loading) {
    return <div className="rounded-2xl border border-gray-100 bg-white p-8 text-sm text-gray-500">Loading notifications…</div>;
  }

  if (!isVendor || !user?.activeVendorId) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-gray-950">Vendor notifications unavailable</h1>
        <p className="mt-2 text-sm text-gray-600">We could not resolve an approved vendor workspace for this account.</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Vendor workspace</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950">Notifications</h1>
        <p className="mt-1 text-sm text-gray-500">Latest orders, bookings, product, wallet and account updates for your authorised vendor scope.</p>
      </div>
      <NotificationCenter scope="vendor" vendorId={user.activeVendorId} categories={FILTERS} pageSize={15} />
    </div>
  );
}
