'use client';
// P1 — Member 1: shared layout used by vendor portal

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, MapPinned, UtensilsCrossed, CalendarDays, TicketPercent, ShoppingBag, MessageCircle, ChartNoAxesCombined, Wallet, LogOut, ShieldCheck, Building2, Bell, Store, type LucideIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { OUTLET_MANAGER_SHOP_PAGE_HREF } from '@/lib/vendor/outlet-manager-navigation';
import { AppearanceControl } from '@/components/shared/appearance-control';

type VendorNavItem = { href: string; activeHref?: string; label: string; icon: LucideIcon };

const NAV: VendorNavItem[] = [
  { href: '/vendor/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/vendor/outlets',    label: 'Outlets',     icon: MapPinned },
  { href: '/vendor/profile',    label: 'Business profile', icon: Building2 },
  { href: '/vendor/products',   label: 'Products',   icon: UtensilsCrossed },
  { href: '/vendor/bookings',   label: 'Bookings',   icon: CalendarDays },
  { href: '/vendor/vouchers',   label: 'Vouchers',   icon: TicketPercent },
  { href: '/vendor/orders',     label: 'Orders',     icon: ShoppingBag },
  { href: '/vendor/wallet',     label: 'Wallet',     icon: Wallet },
  { href: '/vendor/inbox',      label: 'Inbox',      icon: MessageCircle },
  { href: '/vendor/notifications', label: 'Notifications', icon: Bell },
  { href: '/vendor/analytics',  label: 'Analytics',  icon: ChartNoAxesCombined },
];

const OUTLET_MANAGER_NAV: VendorNavItem[] = [
  { href: '/vendor/dashboard', label: 'Operations', icon: LayoutDashboard },
  { href: OUTLET_MANAGER_SHOP_PAGE_HREF, activeHref: '/vendor/outlets', label: 'Shop page', icon: Store },
  { href: '/vendor/products', label: 'Products', icon: UtensilsCrossed },
  { href: '/vendor/bookings', label: 'Bookings', icon: CalendarDays },
  { href: '/vendor/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/vendor/inbox', label: 'Inbox', icon: MessageCircle },
  { href: '/vendor/notifications', label: 'Notifications', icon: Bell },
];

export default function VendorSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { user, loading, isOutletManager } = useAuth();
  const nav = isOutletManager ? OUTLET_MANAGER_NAV : NAV;
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

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="fixed top-0 left-0 bottom-0 w-60 bg-gray-900 text-gray-200 flex flex-col z-40">
      <div className="px-5 py-5 border-b border-gray-700">
        <p className="text-xs text-gray-400 uppercase tracking-wider">Vendor Portal</p>
        <p className="font-semibold text-white mt-0.5">Malaysia Tourism</p>
        {!loading && isOutletManager && <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gray-800 px-2 py-1 text-[0.625rem] font-semibold uppercase tracking-wide text-gray-300"><ShieldCheck size={11} /> Outlet operations</p>}
        {!loading && isOutletManager && user?.activeOutletName && <p className="mt-2 truncate text-xs text-gray-400" title={user.activeOutletName}>{user.activeOutletName}</p>}
      </div>
      <nav className="flex-1 py-4 overflow-y-auto">
        {nav.map(({ href, activeHref, label, icon: Icon }) => (
          <Link
            key={href} href={href}
            className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors
              ${pathname.startsWith(activeHref || href)
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
          >
            <Icon size={17} />
            {label}
            {href === '/vendor/inbox' && unreadChats > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-bold text-white">
                {unreadChats}
              </span>
            )}
          </Link>
        ))}
      </nav>
      <div className="border-t border-gray-700 px-2 py-2">
        <AppearanceControl variant="sidebar-dark" />
      </div>
      <button
        onClick={signOut}
        className="flex items-center gap-3 px-5 py-4 text-sm text-gray-400 hover:text-red-400 border-t border-gray-700 transition-colors"
      >
        <LogOut size={17} /> Sign out
      </button>
    </aside>
  );
}
