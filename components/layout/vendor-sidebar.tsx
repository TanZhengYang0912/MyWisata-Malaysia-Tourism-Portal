'use client';
// P1 — Member 1: shared layout used by vendor portal

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { PortalSidebar, type PortalSidebarSection } from '@/components/layout/portal-sidebar';
import { getVendorNavigationSections } from '@/lib/vendor/navigation';
import { legalNavItems } from '@/components/legal/legal-nav';

export default function VendorSidebar() {
  const { t: tVendor } = useTranslation('vendor');
  const supabase = useMemo(() => createClient(), []);
  const { user, isOutletManager, isVendorOwner, isEventVendor } = useAuth();
  const [unreadChats, setUnreadChats] = useState(0);
  const activeVendorId = user?.activeVendorId ?? null;

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/chat/unread-count');
        const body = (await res.json()) as { data: { count: number } | null };
        if (!cancelled && res.ok && body.data) setUnreadChats(body.data.count);
      } catch {
        // best-effort — a failed refresh just leaves the last-known count showing
      }
    }
    void load();
    // Every send path updates chat_threads.last_message_at, so filtered thread
    // UPDATEs signal new messages without Realtime checking chat_messages RLS
    // for every vendor tab on every message platform-wide. Only the viewer's
    // own reads lower the viewer's count. Threads outside the active vendor
    // (another owned vendor, Super Admin scope) refresh on the next load.
    let channel = supabase
      .channel(`vendor-nav-chat-unread-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_threads', filter: `customer_id=eq.${user.id}` }, () => void load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_message_reads', filter: `user_id=eq.${user.id}` }, () => void load());
    if (activeVendorId) {
      channel = channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_threads', filter: `vendor_id=eq.${activeVendorId}` }, () => void load());
    }
    channel.subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, user?.id, activeVendorId]);

  const navSections = getVendorNavigationSections(isOutletManager, isEventVendor)
    .map<PortalSidebarSection>((section) => ({
      label: tVendor(`navigationSections.${section.labelKey}`),
      items: section.items.map((item) => ({
        ...item,
        label: tVendor(`navigation.${item.label}`),
        count: item.href === '/vendor/inbox' ? unreadChats : undefined,
        countLabel: item.href === '/vendor/inbox' ? String(unreadChats) : undefined,
      })),
    }))
    .filter((section) => section.items.length > 0);

  const roleLabel = isEventVendor
    ? tVendor('shell.roles.eventVendor')
    : isOutletManager
    ? tVendor('shell.roles.outletManager')
    : isVendorOwner
      ? tVendor('shell.roles.vendorOwner')
      : tVendor('shell.roles.teamMember');
  const workspaceName = isOutletManager
    ? user?.activeOutletName || tVendor('shell.outletOperations')
    : user?.vendorName;
  // The business or outlet answers "whose workspace is this", so it leads; the role is secondary.
  const contextLabel = workspaceName || roleLabel;
  const contextDetail = workspaceName ? roleLabel : undefined;

  return (
    <PortalSidebar
      portalName={tVendor('shell.portal')}
      brandName={tVendor('shell.brand')}
      navigationLabel={tVendor('shell.navigation')}
      contextLabel={contextLabel}
      contextDetail={contextDetail}
      sections={navSections}
      footerLinks={[
        ...legalNavItems(tVendor).filter((item) => item.href !== '/legal/about'),
        { href: '/help', label: tVendor('customer:legal.nav.help') },
      ]}
      menuLabel={tVendor('common:accessibility.openNavigation')}
      fixed
    />
  );
}
