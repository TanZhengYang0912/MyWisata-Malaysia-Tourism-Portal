import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

describe('payout report page contract', () => {
  it('renders separate pending earnings, pending withdrawal, reserved and available totals', () => {
    expect(source).toContain('Pending earnings RM');
    expect(source).toContain('Pending withdrawal RM');
    expect(source).toContain('Reserved RM');
    expect(source).toContain('Available RM');
  });

  it('renders observed vendor clawback shortfall data without explanatory copy', () => {
    expect(source).toContain('vendor_clawback_shortfall_month_rm');
    expect(source).toContain('vendor_clawback_open_shortfall_rm');
    expect(source).toContain('payouts.riskExposureTitle');
    expect(source).not.toContain('payouts.riskExposureDescription');
  });

  it('shows each filtered payout detail as a labeled mobile card and keeps the desktop table', () => {
    expect(source).toContain('AdminMobileRecordCard');
    expect(source).toContain('lg:hidden');
    expect(source).toContain('lg:block');
    expect(source).toContain('payouts.columns.date');
    expect(source).toContain('payouts.columns.user');
    expect(source).toContain('payouts.columns.source');
    expect(source).toContain('payouts.columns.requests');
    expect(source).toContain('payouts.columns.amount');
    expect(source).toContain('payouts.columns.fees');
  });

  it('keeps payout summaries compact in two phone columns without clipping values', () => {
    expect(source).toContain('grid grid-cols-2 gap-3 xl:grid-cols-4');
    expect(source).toContain('min-w-0 rounded-2xl border border-border bg-card p-3 sm:p-5');
    expect(source).toContain('break-words text-xl font-bold tracking-[-0.05em] text-foreground sm:mt-4 sm:text-3xl');
    expect(source).toContain('grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3');
    expect(source).toContain('break-words font-mono text-base font-bold text-foreground sm:text-lg');
  });
});
