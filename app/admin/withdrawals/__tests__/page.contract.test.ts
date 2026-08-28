import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync('app/admin/withdrawals/page.tsx', 'utf8');
const rowPath = 'components/admin/withdrawal-review-queue-row.tsx';
const rowSource = existsSync(rowPath) ? readFileSync(rowPath, 'utf8') : '';

describe('withdrawal review queue contract', () => {
  it('keeps the queue in the shared Admin shell', () => {
    expect(pageSource).toContain('AdminPageShell');
    expect(pageSource).toContain('AdminPageHeader');
    expect(pageSource).toContain('AdminFilterBar');
  });

  it('navigates each row to a stable detail route', () => {
    expect(pageSource).toContain('WithdrawalReviewQueueRow');
    expect(rowSource).toContain('href={`/admin/withdrawals/${item.id}`}');
  });

  it('does not execute batch money or fraud decisions and does not own a detail modal', () => {
    expect(pageSource).not.toContain('AdminBatchActionBar');
    expect(pageSource).not.toContain('selectedIds');
    expect(pageSource).not.toContain('applyBatch');
    expect(pageSource).not.toContain('role="dialog"');
    expect(pageSource).not.toContain('/api/admin/withdrawals/${id}');
    expect(pageSource).not.toContain('type="checkbox"');
  });

  it('retains decision-ready queue context', () => {
    expect(pageSource).toContain('withdrawals.metrics.pendingPayoutValue');
    expect(pageSource).toContain('withdrawals.table.approvalProgress');
    expect(pageSource).toContain('withdrawals.table.ageSla');
    expect(rowSource).toContain('priority.labelKey');
  });
});
