'use client';
// P1 — Member 1: shared layout used by vendor portal

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, MapPinned, UtensilsCrossed, CalendarDays, TicketPercent, ShoppingBag, MessageCircle, ChartNoAxesCombined, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const NAV = [
  { href: '/vendor/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/vendor/outlets',    label: 'Outlets',     icon: MapPinned },
  { href: '/vendor/products',   label: 'Products',   icon: UtensilsCrossed },
  { href: '/vendor/bookings',   label: 'Bookings',   icon: CalendarDays },
  { href: '/vendor/vouchers',   label: 'Vouchers',   icon: TicketPercent },
  { href: '/vendor/orders',     label: 'Orders',     icon: ShoppingBag },
  { href: '/vendor/inbox',      label: 'Inbox',      icon: MessageCircle },
  { href: '/vendor/analytics',  label: 'Analytics',  icon: ChartNoAxesCombined },
];

export default function VendorSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="fixed top-0 left-0 bottom-0 w-56 bg-gray-900 text-gray-200 flex flex-col z-40">
      <div className="px-5 py-5 border-b border-gray-700">
        <p className="text-xs text-gray-400 uppercase tracking-wider">Vendor Portal</p>
        <p className="font-semibold text-white mt-0.5">Malaysia Tourism</p>
      </div>
      <nav className="flex-1 py-4 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href} href={href}
            className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors
              ${pathname.startsWith(href)
                ? 'bg-primary-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
          >
            <Icon size={17} />
            {label}
          </Link>
        ))}
      </nav>
      <button
        onClick={signOut}
        className="flex items-center gap-3 px-5 py-4 text-sm text-gray-400 hover:text-red-400 border-t border-gray-700 transition-colors"
      >
        <LogOut size={17} /> Sign out
      </button>
    </aside>
  );
}
