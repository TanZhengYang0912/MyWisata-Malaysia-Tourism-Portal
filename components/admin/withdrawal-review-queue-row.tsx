import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, Clock3, ShieldAlert, TimerReset, UsersRound } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import type { WithdrawalListItem } from '@/lib/wallet/withdrawal-review';

type Translate = (key: string, options?: Record<string, unknown>) => string;

function getReviewPriority(item: WithdrawalListItem) {
  if (item.status === 'overdue') return { labelKey: 'withdrawals.priority.overdue', className: 'border-red-200 bg-red-50 text-red-700', icon: TimerReset };
  if (item.requiresDualApproval && item.approvalCount < 2) return { labelKey: 'withdrawals.priority.waitingForSecondApprover', className: 'border-amber-200 bg-amber-50 text-amber-800', icon: UsersRound };
  if (item.riskLevel === 'high') return { labelKey: 'withdrawals.priority.highRisk', className: 'border-red-200 bg-red-50 text-red-700', icon: AlertTriangle };
  return { labelKey: 'withdrawals.priority.needsAction', className: 'border-border bg-muted text-muted-foreground', icon: Clock3 };
}

export function WithdrawalReviewQueueRow({
  item,
  locale,
  t,
  formatAmount,
  formatAge,
  displayStatus,
}: {
  item: WithdrawalListItem;
  locale: string;
  t: Translate;
  formatAmount: (amountSen: number) => string;
  formatAge: (createdAt: string) => string;
  displayStatus: (value: string | null | undefined) => string;
}) {
  const priority = getReviewPriority(item);
  const PriorityIcon = priority.icon;

  return (
    <Link
      href={`/admin/withdrawals/${item.id}`}
      aria-label={t('withdrawals.accessibility.openRow', {
        customer: item.customerDisplayName,
        amount: formatAmount(item.amountSen),
        priority: t(priority.labelKey),
      })}
      className="group grid grid-cols-[minmax(210px,1.35fr)_120px_145px_150px_120px_145px_32px] items-center gap-4 px-5 py-4 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{item.customerDisplayName.slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{item.customerDisplayName}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString(locale)} · {item.userId.slice(0, 8)}…</p>
        </div>
      </div>
      <div><p className="font-[family-name:var(--font-mono)] text-sm font-bold text-foreground">{formatAmount(item.amountSen)}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.requiresDualApproval ? t('withdrawals.table.rm500Threshold') : t('withdrawals.table.standardReview')}</p></div>
      <div><span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${priority.className}`}><PriorityIcon size={12} />{t(priority.labelKey)}</span>{item.riskLevel && <p className="mt-1 text-[11px] text-muted-foreground">{t('withdrawals.table.risk', { level: displayStatus(item.riskLevel) })}</p>}</div>
      <div><p className="text-sm font-semibold text-foreground">{item.requiresDualApproval ? t('withdrawals.table.dualApprovals', { count: Math.min(item.approvalCount, 2) }) : t('withdrawals.table.singleApproval')}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.requiresDualApproval && item.approvalCount < 2 ? t('withdrawals.table.waitingForSecondApprover') : t('withdrawals.table.approvalPathReady')}</p></div>
      <div><p className={`text-sm font-semibold ${item.status === 'overdue' ? 'text-red-700' : 'text-foreground'}`}>{formatAge(item.createdAt)}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.status === 'overdue' ? t('withdrawals.table.overdue') : t('withdrawals.table.withinReviewWindow')}</p></div>
      <div className="flex items-center gap-2"><StatusBadge status={item.status} />{item.riskLevel === 'high' && <ShieldAlert size={15} aria-label={t('withdrawals.accessibility.highRisk')} className="text-red-600" />}</div>
      <ArrowUpRight size={16} className="text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
    </Link>
  );
}
