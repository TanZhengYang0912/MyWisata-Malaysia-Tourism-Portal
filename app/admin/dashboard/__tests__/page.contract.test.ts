import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(process.cwd(), 'app/admin/dashboard/page.tsx'),
  'utf8',
);

describe('admin approval overview workbench', () => {
  it('surfaces money, urgency, and dual-approval context', () => {
    expect(pageSource).toContain('t("dashboard.metrics.needsAttention")');
    expect(pageSource).toContain('t("dashboard.metrics.pendingPayout")');
    expect(pageSource).toContain('t("dashboard.metrics.overdue")');
    expect(pageSource).toContain('t("dashboard.metrics.dualApproval")');
    expect(pageSource).toContain('RM');
  });

  it('provides an action centre with direct queue links', () => {
    expect(pageSource).toContain('t("dashboard.actionCentre")');
    expect(pageSource).toContain('t("dashboard.lanes.withdrawals.cta")');
    expect(pageSource).toContain('t("dashboard.lanes.kyc.cta")');
    expect(pageSource).toContain('t("dashboard.lanes.support.cta")');
    expect(pageSource).toContain('href="/admin/withdrawals"');
  });

  it('explains data freshness and operational health', () => {
    expect(pageSource).toContain('t("dashboard.lastRefreshed")');
    expect(pageSource).toContain('t("dashboard.queueHealth")');
    expect(pageSource).toContain('t("dashboard.allSources")');
    expect(pageSource).toContain('t("dashboard.queueActivity")');
  });
});
