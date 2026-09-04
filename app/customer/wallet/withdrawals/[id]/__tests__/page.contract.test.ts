import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

describe('withdrawal receipt provider presentation', () => {
  it('does not claim every payout is settled by Stripe or a bank', () => {
    expect(source).toContain('payoutProvider');
    expect(source).toContain('strictMigration.walletReceipt.settlementNotice');
    expect(source).not.toContain('Bank settlement timing depends on Stripe');
  });

  it('renders customer-safe status guidance and announces loading failures', () => {
    expect(source).toContain('statusGuidanceCode');
    expect(source).toContain('role="alert"');
    expect(source).toContain('strictMigration.walletReceipt.backToWallet');
  });

  it('renders immutable settlement proof and explicit money movement', () => {
    expect(source).toContain('settlementProof');
    expect(source).toContain('moneyMovement');
    expect(source).toContain('strictMigration.walletReceipt.moneyMovement.title');
    expect(source).toContain('strictMigration.walletReceipt.proof.title');
    expect(source).toContain('signatureVerified');
    expect(source).toContain('payloadSha256');
    expect(source).toContain('formatMYRFromSen(movement.amountSen)');
    expect(source).not.toContain('−${formatMYRFromSen');
    expect(source).not.toContain('+${formatMYRFromSen');
    expect(source).not.toContain('Mark Paid');
    expect(source).not.toContain('Simulate Paid');
    expect(source).not.toContain('I received the money');
  });

  it('polls only non-terminal receipts and cleans up the timer', () => {
    expect(source).toContain('loadReceipt');
    expect(source).toContain('startSettlementPolling');
    expect(source).toContain('isSettlementPending(receipt.status)');
    expect(source).not.toContain('setInterval');
  });

  it('uses the shared customer page skeleton', () => {
    expect(source).toContain('CustomerPageTitle');
    expect(source).toContain('CustomerPageShell');
  });
});
