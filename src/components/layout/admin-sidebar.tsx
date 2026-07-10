'use client';
// P1 — Member 1: shared layout used by admin portal

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Store, ShieldCheck, Star, Wallet, Ticket, ScrollText, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const NAV = [
  { href: '/admin/dashboard',       label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/admin/vendors',         label: 'Vendor Approval', icon: Store },
  { href: '/admin/kyc',             label: 'KYC Review',      icon: ShieldCheck },
  { href: '/admin/recommendations', label: 'Recommendations', icon: Star },
  { href: '/admin/withdrawals',     label: 'Withdrawals',     icon: Wallet },
  { href: '/admin/support',         label: 'Support Tickets', icon: Ticket },
  { href: '/admin/audit',           label: 'Audit Log',       icon: ScrollText },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <aside className="fixed top-0 left-0 bottom-0 w-60 bg-slate-800 text-gray-200 flex flex-col z-40">
      <div className="px-5 py-5 border-b border-slate-700">
        <p className="text-xs text-slate-400 uppercase tracking-wider">Admin Portal</p>
        <p className="font-semibold text-white mt-0.5">Malaysia Tourism</p>
      </div>
      <nav className="flex-1 py-4 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href} href={href}
            className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors
              ${pathname.startsWith(href)
                ? 'bg-primary-600 text-white'
                : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
          >
            <Icon size={17} />
            {label}
          </Link>
        ))}
      </nav>
      <button
        onClick={signOut}
        className="flex items-center gap-3 px-5 py-4 text-sm text-slate-400 hover:text-red-400 border-t border-slate-700 transition-colors"
      >
        <LogOut size={17} /> Sign out
      </button>
    </aside>
  );
}
