import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Clock3, ShieldAlert, TimerReset, UsersRound } from 'lucide-react';
import { AdminMobileRecordCard } from '@/components/admin/admin-mobile-record-card';
import { StatusBadge } from '@/components/shared/status-badge';
import type { WithdrawalListItem } from '@/lib/wallet/withdrawal-review';

type Translate = (key: string, options?: Record<string, unknown>) => string;

function getReviewPriority(item: WithdrawalListItem) {
  if (item.status === 'overdue') return { labelKey: 'withdrawals.priority.overdue', className: 'border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-200', icon: TimerReset };
  if (item.requiresDualApproval && item.approvalCount < 2) return { labelKey: 'withdrawals.priority.waitingForSecondApprover', className: 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-200', icon: UsersRound };
  if (item.riskLevel === 'high') return { labelKey: 'withdrawals.priority.highRisk', className: 'border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-200', icon: AlertTriangle };
  return { labelKey: 'withdrawals.priority.needsAction', className: 'border-border bg-muted text-muted-foreground', icon: Clock3 };
}

export function WithdrawalReviewQueueRow({
  item,
  locale,
  t,
  formatAmount,
  formatAge,
  displayStatus,
  compact = false,
}: {
  item: WithdrawalListItem;
  locale: string;
  t: Translate;
  formatAmount: (amountSen: number) => string;
  formatAge: (createdAt: string) => string;
  displayStatus: (value: string | null | undefined) => string;
  compact?: boolean;
}) {
  const priority = getReviewPriority(item);
  const PriorityIcon = priority.icon;
  const rowLabel = t('admin:withdrawals.accessibility.openRow', {
    customer: item.customerDisplayName,
    amount: formatAmount(item.amountSen),
    priority: t(priority.labelKey),
  });

  if (compact) {
    return (
      <Link
        href={`/admin/withdrawals/${item.id}`}
        aria-label={rowLabel}
        className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <AdminMobileRecordCard
          className="transition hover:bg-muted/40"
          header={
            <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-foreground">{item.customerDisplayName}</p>
                <p className="mt-1 break-all text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString(locale)} · {item.userId.slice(0, 8)}…</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <StatusBadge status={item.status} />
                {item.riskLevel === 'high' && <ShieldAlert size={15} aria-label={t('admin:withdrawals.accessibility.highRisk')} className="text-red-600 dark:text-red-300" />}
              </div>
            </div>
          }
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <span className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${priority.className}`}><PriorityIcon size={12} />{t(priority.labelKey)}</span>
                {item.riskLevel && <p className="mt-1 break-words text-[11px] text-muted-foreground">{t('admin:withdrawals.table.risk', { level: displayStatus(item.riskLevel) })}</p>}
              </div>
              <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
            </div>
          }
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">{t('admin:withdrawals.table.amount')}</dt>
              <dd className="mt-1 break-words font-[family-name:var(--font-mono)] font-bold text-foreground">{formatAmount(item.amountSen)}</dd>
              <dd className="mt-1 break-words text-[11px] text-muted-foreground">{item.requiresDualApproval ? t('admin:withdrawals.table.rm500Threshold') : t('admin:withdrawals.table.standardReview')}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">{t('admin:withdrawals.table.approvalProgress')}</dt>
              <dd className="mt-1 break-words font-semibold text-foreground">{item.requiresDualApproval ? t('admin:withdrawals.table.dualApprovals', { count: Math.min(item.approvalCount, 2) }) : t('admin:withdrawals.table.singleApproval')}</dd>
              <dd className="mt-1 break-words text-[11px] text-muted-foreground">{item.requiresDualApproval && item.approvalCount < 2 ? t('admin:withdrawals.table.waitingForSecondApprover') : t('admin:withdrawals.table.approvalPathReady')}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs font-medium text-muted-foreground">{t('admin:withdrawals.table.ageSla')}</dt>
              <dd className={`mt-1 break-words text-sm font-semibold ${item.status === 'overdue' ? 'text-red-700 dark:text-red-200' : 'text-foreground'}`}>{formatAge(item.createdAt)}</dd>
              <dd className="mt-1 break-words text-[11px] text-muted-foreground">{item.status === 'overdue' ? t('admin:withdrawals.table.overdue') : t('admin:withdrawals.table.withinReviewWindow')}</dd>
            </div>
          </dl>
        </AdminMobileRecordCard>
      </Link>
    );
  }

  return (
    <Link
      href={`/admin/withdrawals/${item.id}`}
      aria-label={rowLabel}
      className="group grid grid-cols-[minmax(210px,1.35fr)_120px_145px_150px_120px_145px_32px] items-center gap-4 px-5 py-4 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{item.customerDisplayName.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{item.customerDisplayName}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString(locale)} · {item.userId.slice(0, 8)}…</p>
        </div>
      </div>
      <div><p className="font-[family-name:var(--font-mono)] text-sm font-bold text-foreground">{formatAmount(item.amountSen)}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.requiresDualApproval ? t('admin:withdrawals.table.rm500Threshold') : t('admin:withdrawals.table.standardReview')}</p></div>
      <div><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${priority.className}`}><PriorityIcon size={12} />{t(priority.labelKey)}</span>{item.riskLevel && <p className="mt-1 text-[11px] text-muted-foreground">{t('admin:withdrawals.table.risk', { level: displayStatus(item.riskLevel) })}</p>}</div>
      <div><p className="text-sm font-semibold text-foreground">{item.requiresDualApproval ? t('admin:withdrawals.table.dualApprovals', { count: Math.min(item.approvalCount, 2) }) : t('admin:withdrawals.table.singleApproval')}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.requiresDualApproval && item.approvalCount < 2 ? t('admin:withdrawals.table.waitingForSecondApprover') : t('admin:withdrawals.table.approvalPathReady')}</p></div>
      <div><p className={`text-sm font-semibold ${item.status === 'overdue' ? 'text-red-700 dark:text-red-200' : 'text-foreground'}`}>{formatAge(item.createdAt)}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.status === 'overdue' ? t('admin:withdrawals.table.overdue') : t('admin:withdrawals.table.withinReviewWindow')}</p></div>
      <div className="flex items-center gap-2"><StatusBadge status={item.status} />{item.riskLevel === 'high' && <ShieldAlert size={15} aria-label={t('admin:withdrawals.accessibility.highRisk')} className="text-red-600 dark:text-red-300" />}</div>
      <ArrowUpRight size={16} className="text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}
