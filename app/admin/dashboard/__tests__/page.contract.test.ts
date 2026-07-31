import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(process.cwd(), 'app/admin/dashboard/page.tsx'),
  'utf8',
);

describe('admin approval overview workbench', () => {
  it('surfaces money, urgency, and dual-approval context', () => {
    expect(pageSource).toContain('Needs attention');
    expect(pageSource).toContain('Pending payout value');
    expect(pageSource).toContain('Overdue withdrawals');
    expect(pageSource).toContain('Dual approval');
    expect(pageSource).toContain('RM');
  });

  it('provides an action centre with direct queue links', () => {
    expect(pageSource).toContain('Action centre');
    expect(pageSource).toContain('Review withdrawals');
    expect(pageSource).toContain('Open KYC queue');
    expect(pageSource).toContain('Open support queue');
    expect(pageSource).toContain('href="/admin/withdrawals"');
  });

  it('explains data freshness and operational health', () => {
    expect(pageSource).toContain('Last refreshed');
    expect(pageSource).toContain('Queue health');
    expect(pageSource).toContain('All sources responding');
    expect(pageSource).toContain('Queue activity');
  });
});
