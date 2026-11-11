import { describe, expect, it } from 'vitest';
import { resolveSupportPolicy } from '../policy';

describe('resolveSupportPolicy', () => {
  it('never offers a payment retry for unknown or unavailable state', () => {
    expect(resolveSupportPolicy('payment', 'unavailable').actions).toEqual(['open_record', 'refresh_status', 'handoff']);
    expect(resolveSupportPolicy('payment', 'none').actions).not.toContain('pay_again');
  });

  it('answers sensitive policy questions only from published knowledge', () => {
    expect(resolveSupportPolicy('refund', 'none').canAnswerPolicy).toBe(false);
    expect(resolveSupportPolicy('kyc', 'published_kb').canAnswerPolicy).toBe(true);
    expect(resolveSupportPolicy('withdrawal', 'verified_record').canStateRecord).toBe(true);
  });
});
