'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardRealtime({ vendorId }: { vendorId: string }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any;
    let active = true;

    // One order writes several order_items rows; collapse the burst into one
    // server re-render of the dashboard.
    function scheduleRefresh() {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        router.refresh();
      }, 250);
    }

    async function subscribe() {
      const { createClient } = await import('@/lib/supabase/client');
      if (!active) return;
      const client = createClient();
      // Only vendor-scoped rows: unfiltered orders/inventory subscriptions made
      // Realtime evaluate every platform-wide change for every open dashboard.
      channel = client.channel(`vendor-dashboard-${vendorId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `vendor_id=eq.${vendorId}` }, scheduleRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `vendor_id=eq.${vendorId}` }, scheduleRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'outlets', filter: `vendor_id=eq.${vendorId}` }, scheduleRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews', filter: `vendor_id=eq.${vendorId}` }, scheduleRefresh)
        .subscribe();
      // Fallback for changes with no vendor-scoped row (order status, stock),
      // only while someone is looking at the dashboard.
      timer = setInterval(() => {
        if (document.visibilityState === 'visible') router.refresh();
      }, 60000);
    }

    const refreshOnFocus = () => router.refresh();
    window.addEventListener('focus', refreshOnFocus);
    void subscribe().catch(() => {});
    return () => {
      active = false;
      window.removeEventListener('focus', refreshOnFocus);
      if (timer) clearInterval(timer);
      if (refreshTimer) clearTimeout(refreshTimer);
      if (channel) {
        import('@/lib/supabase/client')
          .then(({ createClient }) => createClient().removeChannel(channel))
          .catch(() => {});
      }
    };
  }, [router, vendorId]);

  return null;
}
