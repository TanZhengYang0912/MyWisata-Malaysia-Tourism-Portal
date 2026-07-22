import { describe, expect, it } from 'vitest';
import { WALLET_REASON_CATEGORIES, isWalletReasonCategory, walletReasonSchema } from './wallet-reason-schemas';

describe('wallet reason schemas', () => {
  it('defines action-specific categories', () => {
    expect(WALLET_REASON_CATEGORIES.hold).toContain('insufficient_payout_information');
    expect(WALLET_REASON_CATEGORIES.reject).toContain('bank_details_mismatch');
    expect(WALLET_REASON_CATEGORIES.resume).toContain('additional_information_verified');
    expect(WALLET_REASON_CATEGORIES.adjustment).toContain('refund');
  });

  it('rejects categories belonging to a different Wallet action', () => {
    expect(walletReasonSchema.safeParse({
      action: 'hold',
      reasonCategory: 'bank_details_mismatch',
      reason: 'The payout information needs additional verification.',
    }).success).toBe(false);
  });

  it('requires a category and a 10-character explanation', () => {
    expect(walletReasonSchema.safeParse({ action: 'resume', reasonCategory: '', reason: 'short' }).success).toBe(false);
    expect(walletReasonSchema.safeParse({ action: 'resume', reasonCategory: 'other', reason: 'The additional information was verified.' }).success).toBe(true);
  });

  it('exposes a runtime category guard', () => {
    expect(isWalletReasonCategory('resume', 'risk_review_cleared')).toBe(true);
    expect(isWalletReasonCategory('resume', 'bank_details_mismatch')).toBe(false);
  });
});
