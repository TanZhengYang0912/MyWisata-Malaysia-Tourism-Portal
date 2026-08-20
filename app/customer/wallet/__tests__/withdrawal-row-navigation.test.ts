import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

describe('customer wallet withdrawal row navigation', () => {
  it('makes both pending and historical withdrawal rows native receipt links', () => {
    const receiptRowLinks = pageSource.match(
      /<Link\s+key=\{w\.id\}\s+href=\{`\/customer\/wallet\/withdrawals\/\$\{w\.id\}`\}/g,
    ) ?? [];

    expect(receiptRowLinks).toHaveLength(2);
    expect(pageSource).not.toContain('tCustomer("ui.wallet.viewReceipt")');
  });

  it('provides pointer, hover, and keyboard focus feedback on both rows', () => {
    expect(pageSource.match(/cursor-pointer/g) ?? []).toHaveLength(2);
    expect(pageSource.match(/hover:bg-muted\/40/g) ?? []).toHaveLength(2);
    expect(pageSource.match(/focus-visible:ring-2/g) ?? []).toHaveLength(2);
  });
});
