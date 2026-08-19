'use client';

import { NotificationCenter } from '@/components/shared/notification-center';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from 'react-i18next';

export default function VendorNotificationsPage() {
  const { t } = useTranslation('vendor');
  const { user, loading, isVendor } = useAuth();
  const filters = [
    { value: 'all', label: t('ui.notifications.all') },
    { value: 'unread', label: t('ui.notifications.unread') },
    { value: 'vendor_orders', label: t('ui.notifications.orders') },
    { value: 'vendor_bookings', label: t('ui.notifications.bookings') },
    { value: 'vendor_products', label: t('ui.notifications.products') },
    { value: 'vendor_wallet', label: t('ui.notifications.wallet') },
    { value: 'vendor_account', label: t('ui.notifications.account') },
  ];

  if (loading) {
    return <div className="rounded-2xl border border-gray-100 bg-white p-8 text-sm text-gray-500">{t('ui.notifications.loading')}</div>;
  }

  if (!isVendor || !user?.activeVendorId) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-gray-950">{t('ui.notifications.unavailableTitle')}</h1>
        <p className="mt-2 text-sm text-gray-600">{t('ui.notifications.unavailableDescription')}</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">{t('ui.notifications.workspace')}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950">{t('ui.notifications.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('ui.notifications.description')}</p>
      </div>
      <NotificationCenter scope="vendor" vendorId={user.activeVendorId} categories={filters} pageSize={15} />
    </div>
  );
}
