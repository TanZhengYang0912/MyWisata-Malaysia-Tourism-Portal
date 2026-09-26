'use client';

import { Bell, LogOut, Search } from 'lucide-react';
import { NotificationBell } from '@/components/shared/notification-bell';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AppearanceControl } from '@/components/shared/appearance-control';
import { LanguageSwitcher } from '@/components/shared/language-switcher';
import { GlobalCommandPalette } from '@/components/shared/global-command-palette';
import { useCommandShortcutLabel } from '@/components/shared/command-shortcut';

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
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const commandShortcutLabel = useCommandShortcutLabel();
  const vendorId = user?.activeVendorId ?? null;
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-end gap-4 bg-background/95 px-4 backdrop-blur-md sm:px-6">
        {/* Global Search / Command Launcher */}
        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          aria-label={tCommon('command.openPalette')}
          className="mr-auto flex items-center gap-2 rounded-xl border border-border bg-card/70 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search size={14} className="text-muted-foreground" />
          <span className="hidden md:inline">{tCommon('command.searchVendorPlaceholder')}</span>
          <span className="md:hidden">{tCommon('actions.search')}</span>
          <kbd className="ml-1 shrink-0 inline-flex items-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">{commandShortcutLabel}</kbd>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <LanguageSwitcher compact className="hidden w-28 sm:flex" />
          <AppearanceControl />
          {!loading && vendorId ? (
            <NotificationBell scope="vendor" vendorId={vendorId} />
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

      <GlobalCommandPalette
        scope="vendor"
        isOutletManager={isOutletManager}
        triggerOpen={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />
    </>
  );
}
