import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
const listSource = readFileSync(new URL('../../../../components/customer/wallet/withdrawal-list.tsx', import.meta.url), 'utf8');

describe('customer wallet withdrawal row navigation', () => {
  it('keeps the in-progress withdrawal row as a native receipt link', () => {
    const receiptRowLinks = listSource.match(
      /<Link\s+key=\{w\.id\}\s+href=\{`\/customer\/wallet\/withdrawals\/\$\{w\.id\}`\}/g,
    ) ?? [];

    expect(receiptRowLinks).toHaveLength(1);
    expect(listSource).not.toContain('tCustomer("ui.wallet.viewReceipt")');
  });

  it('provides pointer, hover, and keyboard focus feedback on the linked row', () => {
    expect(listSource.match(/cursor-pointer/g) ?? []).toHaveLength(1);
    expect(listSource.match(/hover:bg-muted\/40/g) ?? []).toHaveLength(1);
    expect(listSource.match(/focus-visible:ring-2/g) ?? []).toHaveLength(1);
  });

  it('shows the reserved withdrawal as a primary-blue negative amount', () => {
    expect(listSource).toContain('text-primary">-{formatMYR(w.amount)}');
  });

  it('refreshes wallet buckets while a payout is awaiting provider settlement', () => {
    expect(pageSource).toContain('refreshWalletState');
    expect(pageSource).toContain('startSettlementPolling');
    expect(pageSource).toContain('isSettlementPending(withdrawal.status)');
    expect(pageSource).not.toContain('setInterval');
  });
});
