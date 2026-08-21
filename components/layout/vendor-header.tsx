'use client';

import Link from 'next/link';
import { Bell, Building2, LogOut } from 'lucide-react';
import { NotificationBell } from '@/components/shared/notification-bell';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppearanceControl } from '@/components/shared/appearance-control';
import { LanguageSwitcher } from '@/components/shared/language-switcher';

function roleLabel(isOutletManager: boolean, isVendorOwner: boolean) {
  if (isOutletManager) return 'shell.roles.outletManager';
  if (isVendorOwner) return 'shell.roles.vendorOwner';
  return 'shell.roles.teamMember';
}

/** Shared vendor shell header. The active vendor comes from the authenticated
 * session rather than route parameters, and is passed to the server-authorized
 * notification API by NotificationBell. */
export default function VendorHeader() {
  const { user, loading, isOutletManager, isVendorOwner } = useAuth();
  const { t } = useTranslation('vendor');
  const { t: tCommon } = useTranslation('common');
  const vendorId = user?.activeVendorId ?? null;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 bg-background/95 px-4 backdrop-blur-md sm:px-6">
        <Link href="/vendor/dashboard" className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
            <Building2 size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-gray-950">{t('shell.portal')}</span>
            <span className="block truncate text-xs text-gray-500">
              {loading ? t('shell.loadingWorkspace') : t(roleLabel(isOutletManager, isVendorOwner))}
              {user?.activeOutletName ? ` · ${user.activeOutletName}` : ''}
            </span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher compact className="hidden w-28 sm:flex" />
          <AppearanceControl />
          {!loading && vendorId ? (
            <NotificationBell scope="vendor" vendorId={vendorId} allHref="/vendor/notifications" />
          ) : (
            <span aria-hidden="true" className="rounded-lg p-1.5 text-gray-300"><Bell size={18} /></span>
          )}
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label={tCommon('actions.signOut')}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card/80 px-3 text-xs font-semibold text-foreground transition hover:border-primary/30 hover:bg-secondary"
          >
            <span className="hidden max-w-32 truncate sm:inline">{loading ? t('shell.loadingWorkspace') : user?.fullName || t(roleLabel(isOutletManager, isVendorOwner))}</span>
            <LogOut size={15} aria-hidden="true" />
          </button>
        </div>
    </header>
  );
}
