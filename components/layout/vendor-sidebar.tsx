'use client';
// P1 — Member 1: shared layout used by vendor portal

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { PortalSidebar, type PortalSidebarSection } from '@/components/layout/portal-sidebar';
import { getVendorNavigationSections } from '@/lib/vendor/navigation';

export default function VendorSidebar() {
  const { t: tVendor } = useTranslation('vendor');
  const supabase = useMemo(() => createClient(), []);
  const { user, isOutletManager, isVendorOwner } = useAuth();
  const [unreadChats, setUnreadChats] = useState(0);

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
    const channel = supabase
      .channel(`vendor-nav-chat-unread-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => void load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_message_reads' }, () => void load())
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, user?.id]);

  const navSections = getVendorNavigationSections(isOutletManager)
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

  const contextLabel = isOutletManager
    ? tVendor('shell.roles.outletManager')
    : isVendorOwner
      ? tVendor('shell.roles.vendorOwner')
      : tVendor('shell.roles.teamMember');
  const contextDetail = isOutletManager
    ? user?.activeOutletName || tVendor('shell.outletOperations')
    : tVendor('shell.workspace');

  return (
    <PortalSidebar
      portalName={tVendor('shell.portal')}
      brandName={tVendor('shell.brand')}
      navigationLabel={tVendor('shell.navigation')}
      contextLabel={contextLabel}
      contextDetail={contextDetail}
      sections={navSections}
      fixed
    />
  );
}
