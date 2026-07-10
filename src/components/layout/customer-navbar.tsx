'use client';
// P1 — Member 1: shared layout used by customer portal

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ShoppingCart, Bell, User, MapPin, Search, Home, Wallet } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const NAV = [
  { href: '/discovery', label: 'Discover', icon: Home },
  { href: '/search',    label: 'Search',   icon: Search },
  { href: '/cart',      label: 'Cart',     icon: ShoppingCart },
  { href: '/wallet',    label: 'Wallet',   icon: Wallet },
  { href: '/profile',   label: 'Profile',  icon: User },
];

export default function CustomerNavbar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <>
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 h-14 flex items-center px-4 gap-3">
        <Link href="/discovery" className="flex items-center gap-1.5 font-bold text-primary-700 text-lg mr-auto">
          <MapPin size={18} className="text-brand-gold" />
          Malaysia Tourism
        </Link>
        <button title="Notifications" className="relative p-1.5 text-gray-500 hover:text-gray-800">
          <Bell size={20} />
        </button>
        <button
          onClick={handleSignOut}
          className="text-xs text-gray-500 hover:text-red-600 transition-colors"
        >
          Sign out
        </button>
      </header>

      {/* Bottom tab bar (mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href} href={href}
            className={`flex flex-col items-center justify-center flex-1 py-2 text-[10px] gap-0.5 transition-colors
              ${pathname.startsWith(href) ? 'text-primary-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Side nav (desktop) */}
      <aside className="hidden md:flex fixed top-14 left-0 bottom-0 w-52 flex-col border-r border-gray-200 bg-white pt-4 z-30">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href} href={href}
            className={`flex items-center gap-3 px-5 py-2.5 text-sm font-medium transition-colors
              ${pathname.startsWith(href)
                ? 'bg-primary-50 text-primary-700 border-r-2 border-primary-600'
                : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Icon size={17} />
            {label}
          </Link>
        ))}
      </aside>
    </>
  );
}
