'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Banknote,
  Bot,
  CalendarDays,
  CirclePlus,
  ClipboardCheck,
  CornerDownLeft,
  DollarSign,
  Gem,
  Inbox,
  LayoutDashboard,
  MapPinned,
  Moon,
  Package,
  Search,
  Settings2,
  Shield,
  ShieldCog,
  ShoppingBag,
  Sparkles,
  Sun,
  TicketPercent,
  UsersRound,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useCommandShortcutLabel } from '@/components/shared/command-shortcut';

export interface CommandItem {
  id: string;
  title: string;
  category: string;
  href?: string;
  action?: () => void;
  icon: LucideIcon;
  badge?: number | string;
  keywords?: string[];
}

interface Props {
  scope: 'admin' | 'vendor';
  userRole?: string;
  pendingCounts?: Record<string, number>;
  triggerOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function GlobalCommandPalette({ scope, userRole, pendingCounts = {}, triggerOpen, onOpenChange }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const router = useRouter();
  const { t: tCommon } = useTranslation('common');
  const { t: tAdmin } = useTranslation('admin');
  const { t: tVendor } = useTranslation('vendor');
  const { theme, setTheme } = useTheme();
  const commandShortcutLabel = useCommandShortcutLabel();

  const isOpen = triggerOpen !== undefined ? triggerOpen : internalOpen;
  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (onOpenChange) {
        onOpenChange(nextOpen);
      } else {
        setInternalOpen(nextOpen);
      }
      if (!nextOpen) {
        setQuery('');
        setSelectedIndex(0);
      }
    },
    [onOpenChange]
  );

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(!isOpen);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setOpen]);

  const items = useMemo<CommandItem[]>(() => {
    if (scope === 'admin') {
      const isSuperAdmin = userRole === 'super_admin';
      const isApprover = userRole === 'approver';

      const adminItems: CommandItem[] = [
        {
          id: 'admin-overview',
          title: tAdmin('navigation.Overview'),
          category: tCommon('command.navigation'),
          href: '/admin/dashboard',
          icon: Activity,
          keywords: ['home', 'dashboard', 'overview'],
        },
        {
          id: 'admin-vendors',
          title: tAdmin('navigation.Vendor Approvals'),
          category: tCommon('command.queue'),
          href: '/admin/vendors',
          icon: Package,
          badge: pendingCounts.vendors,
          keywords: ['vendor', 'approval', 'onboarding'],
        },
        {
          id: 'admin-catalogue',
          title: tAdmin('navigation.Catalogue Review'),
          category: tCommon('command.queue'),
          href: '/admin/catalogue',
          icon: ClipboardCheck,
          badge: pendingCounts.catalogue,
          keywords: ['catalogue', 'listing', 'product', 'experience'],
        },
        {
          id: 'admin-kyc',
          title: tAdmin('navigation.KYC Review'),
          category: tCommon('command.queue'),
          href: '/admin/kyc',
          icon: Shield,
          badge: pendingCounts.kyc,
          keywords: ['kyc', 'identity', 'verification', 'customer'],
        },
        {
          id: 'admin-withdrawals',
          title: tAdmin('navigation.Withdrawals'),
          category: tCommon('command.queue'),
          href: '/admin/withdrawals',
          icon: DollarSign,
          badge: pendingCounts.withdrawals,
          keywords: ['withdrawal', 'payout', 'money', 'finance'],
        },
        {
          id: 'admin-support',
          title: tAdmin('navigation.Support Tickets'),
          category: tCommon('command.queue'),
          href: '/admin/support',
          icon: Inbox,
          badge: pendingCounts.tickets,
          keywords: ['support', 'ticket', 'help', 'inbox'],
        },
        {
          id: 'admin-recommendations',
          title: tAdmin('navigation.Recommendations'),
          category: tCommon('command.queue'),
          href: '/admin/recommendations',
          icon: Gem,
          badge: pendingCounts.recommendations,
          keywords: ['recommendations', 'gems', 'featured'],
        },
        {
          id: 'admin-reports',
          title: tAdmin('navigation.Payout Reports'),
          category: tCommon('command.navigation'),
          href: '/admin/reports/payouts',
          icon: Banknote,
          keywords: ['reports', 'payouts', 'statements'],
        },
        {
          id: 'admin-chatbot',
          title: tAdmin('navigation.Chatbot'),
          category: tCommon('command.navigation'),
          href: '/admin/chatbot',
          icon: Bot,
          keywords: ['ai', 'chatbot', 'faq', 'knowledge'],
        },
      ];

      if (isSuperAdmin) {
        adminItems.push(
          {
            id: 'admin-users',
            title: tAdmin('navigation.User Management'),
            category: tCommon('command.admin'),
            href: '/admin/users',
            icon: UsersRound,
            keywords: ['users', 'roles', 'customers', 'vendors'],
          },
          {
            id: 'admin-access-control',
            title: tAdmin('navigation.Access Control'),
            category: tCommon('command.admin'),
            href: '/admin/access-control',
            icon: ShieldCog,
            keywords: ['security', 'permissions', 'access'],
          },
          {
            id: 'admin-wallet-settings',
            title: tAdmin('navigation.Wallet Settings'),
            category: tCommon('command.admin'),
            href: '/admin/wallet/settings',
            icon: Settings2,
            keywords: ['wallet', 'limits', 'thresholds'],
          },
          {
            id: 'admin-ai-assistant',
            title: tAdmin('navigation.AI Assistant'),
            category: tCommon('command.admin'),
            href: '/admin/ai-assistant',
            icon: Sparkles,
            keywords: ['ai', 'copilot', 'assistant'],
          }
        );
      }

      // Actions
      adminItems.push({
        id: 'toggle-theme',
        title: theme === 'dark' ? tCommon('theme.light') : tCommon('theme.dark'),
        category: tCommon('command.preferences'),
        action: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
        icon: theme === 'dark' ? Sun : Moon,
        keywords: ['theme', 'dark', 'light', 'mode'],
      });

      return isApprover ? adminItems.filter((i) => i.href?.includes('withdrawal')) : adminItems;
    }

    // Vendor Scope
    return [
      {
        id: 'vendor-dashboard',
        title: tVendor('navigation.Dashboard'),
        category: tCommon('command.navigation'),
        href: '/vendor/dashboard',
        icon: LayoutDashboard,
        keywords: ['home', 'overview', 'stats', 'analytics'],
      },
      {
        id: 'vendor-action-product',
        title: tVendor('ui.products.addProduct'),
        category: tCommon('command.actions'),
        href: '/vendor/products',
        icon: CirclePlus,
        keywords: ['new product', 'create listing', 'add item'],
      },
      {
        id: 'vendor-action-slot',
        title: tVendor('ui.bookings.addSlot'),
        category: tCommon('command.actions'),
        href: '/vendor/bookings',
        icon: CirclePlus,
        keywords: ['new slot', 'operating hours', 'schedule', 'capacity'],
      },
      {
        id: 'vendor-bookings',
        title: tVendor('navigation.Bookings'),
        category: tCommon('command.navigation'),
        href: '/vendor/bookings',
        icon: CalendarDays,
        keywords: ['booking', 'reservation', 'slot', 'check-in'],
      },
      {
        id: 'vendor-orders',
        title: tVendor('navigation.Orders'),
        category: tCommon('command.navigation'),
        href: '/vendor/orders',
        icon: ShoppingBag,
        keywords: ['order', 'fulfillment', 'sales'],
      },
      {
        id: 'vendor-products',
        title: tVendor('navigation.Products'),
        category: tCommon('command.navigation'),
        href: '/vendor/products',
        icon: UtensilsCrossed,
        keywords: ['product', 'food', 'experience', 'listing'],
      },
      {
        id: 'vendor-outlets',
        title: tVendor('navigation.Outlets'),
        category: tCommon('command.navigation'),
        href: '/vendor/outlets',
        icon: MapPinned,
        keywords: ['outlet', 'branch', 'store', 'shop'],
      },
      {
        id: 'vendor-vouchers',
        title: tVendor('navigation.Vouchers'),
        category: tCommon('command.navigation'),
        href: '/vendor/vouchers',
        icon: TicketPercent,
        keywords: ['voucher', 'discount', 'promotion', 'coupon'],
      },
      {
        id: 'vendor-wallet',
        title: tVendor('navigation.Wallet'),
        category: tCommon('command.navigation'),
        href: '/vendor/wallet',
        icon: Wallet,
        keywords: ['wallet', 'balance', 'withdraw', 'payout', 'finance'],
      },
      {
        id: 'toggle-theme',
        title: theme === 'dark' ? tCommon('theme.light') : tCommon('theme.dark'),
        category: tCommon('command.preferences'),
        action: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
        icon: theme === 'dark' ? Sun : Moon,
        keywords: ['theme', 'dark', 'light', 'mode'],
      },
    ];
  }, [scope, userRole, pendingCounts, tAdmin, tVendor, tCommon, theme, setTheme]);

  // Filtered items
  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const clean = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(clean);
      const matchCategory = item.category.toLowerCase().includes(clean);
      const matchKeywords = item.keywords?.some((k) => k.toLowerCase().includes(clean));
      return matchTitle || matchCategory || matchKeywords;
    });
  }, [items, query]);

  const activeIndex = selectedIndex >= filtered.length ? 0 : selectedIndex;

  useEffect(() => {
    if (isOpen && filtered.length > 0) {
      resultRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, filtered.length, isOpen]);

  const executeItem = useCallback(
    (item: CommandItem) => {
      setOpen(false);
      if (item.action) {
        item.action();
      } else if (item.href) {
        router.push(item.href);
      }
    },
    [router, setOpen]
  );

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((current) => (current + 1) % Math.max(1, filtered.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((current) => (current - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[activeIndex]) {
        executeItem(filtered[activeIndex]);
      }
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl overflow-hidden rounded-2xl border border-border bg-card p-0 shadow-2xl">
        <DialogTitle className="sr-only">
          {tCommon('command.title')}
        </DialogTitle>

        {/* Input Header */}
        <div className="relative flex items-center border-b border-border px-4 py-3 pr-20">
          <Search size={18} className="text-muted-foreground mr-3 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              `${scope === 'admin'
                ? tCommon('command.searchAdminPlaceholder')
                : tCommon('command.searchVendorPlaceholder')} (${commandShortcutLabel})`
            }
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {tCommon('keyboard.esc')}
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {tCommon('command.noResults')}
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((item, index) => {
                const isSelected = index === activeIndex;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    ref={(element) => {
                      resultRefs.current[index] = element;
                    }}
                    onClick={() => executeItem(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                      isSelected
                        ? 'bg-primary text-primary-foreground font-medium'
                        : 'text-foreground hover:bg-muted'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon size={16} className={isSelected ? 'text-primary-foreground' : 'text-muted-foreground'} />
                      <div className="min-w-0">
                        <span className="block truncate">{item.title}</span>
                        <span
                          className={`block text-[11px] ${
                            isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'
                          }`}
                        >
                          {item.category}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {typeof item.badge === 'number' && item.badge > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            isSelected
                              ? 'bg-primary-foreground text-primary'
                              : 'bg-primary/15 text-primary'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                      {isSelected && <CornerDownLeft size={14} className="opacity-80" />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-border bg-card px-1 font-mono">↑</kbd>{' '}
              <kbd className="rounded border border-border bg-card px-1 font-mono">↓</kbd>{' '}
              {tCommon('command.navigate')}
            </span>
            <span>
              <kbd className="rounded border border-border bg-card px-1 font-mono">↵</kbd>{' '}
              {tCommon('command.select')}
            </span>
          </div>
          <div className="flex items-center gap-1 font-semibold text-primary">
            <span>{tCommon('brand.speed')}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
