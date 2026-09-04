'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardRealtime({ vendorId }: { vendorId: string }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let channel: any;
    let active = true;

    async function subscribe() {
      const { createClient } = await import('@/lib/supabase/client');
      if (!active) return;
      const client = createClient();
      channel = client.channel(`vendor-dashboard-${vendorId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `vendor_id=eq.${vendorId}` }, () => router.refresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => router.refresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `vendor_id=eq.${vendorId}` }, () => router.refresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => router.refresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'outlets', filter: `vendor_id=eq.${vendorId}` }, () => router.refresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews', filter: `vendor_id=eq.${vendorId}` }, () => router.refresh())
        .subscribe();
      timer = setInterval(() => router.refresh(), 60000);
    }

    const refreshOnFocus = () => router.refresh();
    window.addEventListener('focus', refreshOnFocus);
    void subscribe().catch(() => {});
    return () => {
      active = false;
      window.removeEventListener('focus', refreshOnFocus);
      if (timer) clearInterval(timer);
      if (channel) {
        import('@/lib/supabase/client')
          .then(({ createClient }) => createClient().removeChannel(channel))
          .catch(() => {});
      }
    };
  }, [router, vendorId]);

  return null;
}
