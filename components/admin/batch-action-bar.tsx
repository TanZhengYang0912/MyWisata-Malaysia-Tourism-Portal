'use client';

import { Archive, Check, CheckCircle2, CheckSquare, Clipboard, Loader2, MessageSquare, PauseCircle, RefreshCcw, RotateCcw, ShieldAlert, UserRoundX, X, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';

export type AdminBatchAction = { value: string; label: string };

const ACTION_ICONS: Record<string, typeof Check> = {
  approve: Check,
  reject: XCircle,
  request_changes: Clipboard,
  change_requested: Clipboard,
  request_info: MessageSquare,
  suspend: Archive,
  unsuspend: RefreshCcw,
  reactivate: RefreshCcw,
  hold: PauseCircle,
  resume: RotateCcw,
  'fraud-override': ShieldAlert,
  resolved: CheckCircle2,
  dismissed: XCircle,
  activate: CheckCircle2,
  deactivate: XCircle,
  revoke: UserRoundX,
};

type Props = {
  selectedCount: number;
  onApply: (action: string) => void;
  onClear: () => void;
  actions: AdminBatchAction[];
  busy?: boolean;
  message?: string;
};

/** Shared selection/action treatment for admin review queues. */
export function AdminBatchActionBar({ selectedCount, onApply, onClear, actions, busy = false, message }: Props) {
  const { t, i18n } = useTranslation('admin');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  if (selectedCount === 0 && !message) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-primary/15 bg-primary/5 px-5 py-3 text-sm">
      <div className="mr-1 flex items-center gap-2 font-semibold text-primary">
        <CheckSquare size={16} />
        {t('selection.selected', { count: formatNumber(selectedCount, locale), defaultValue: '{{count}} selected' })}
      </div>
      {message && <span className="text-xs text-muted-foreground">{message}</span>}
      {selectedCount > 0 && (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {actions.map((action) => {
            const Icon = ACTION_ICONS[action.value] ?? Check;
            const destructive = ['reject', 'suspend', 'dismissed', 'deactivate', 'revoke', 'fraud-override'].includes(action.value);
            return (
              <button
                key={action.value}
                type="button"
                disabled={busy}
                onClick={() => onApply(action.value)}
                className={`inline-flex items-center gap-1.5 rounded-xl border bg-white px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${destructive ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-primary/20 text-primary hover:bg-primary/5'}`}
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
                {t(`batchActions.${action.value}`, { defaultValue: action.label })}
              </button>
            );
          })}
          <button type="button" onClick={onClear} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-white hover:text-foreground">
            <X size={14} />
            {t('selection.clear', { defaultValue: 'Clear selection' })}
          </button>
        </div>
      )}
    </div>
  );
}
