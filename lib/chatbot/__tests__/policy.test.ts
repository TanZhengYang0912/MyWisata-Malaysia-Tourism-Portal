import { describe, expect, it } from 'vitest';
import { allowedSupportActions, detectSensitiveSupportDomain, resolveSupportPolicy } from '../policy';

describe('resolveSupportPolicy', () => {
  it('never offers a payment retry for unknown or unavailable state', () => {
    expect(resolveSupportPolicy('payment', 'unavailable').actions).toEqual(['refresh_status', 'open_record', 'handoff']);
    expect(resolveSupportPolicy('payment', 'none').actions).not.toContain('pay_again');
  });

  it('answers sensitive policy questions only from published knowledge', () => {
    expect(resolveSupportPolicy('refund', 'none').canAnswerPolicy).toBe(false);
    expect(resolveSupportPolicy('kyc', 'published_kb').canAnswerPolicy).toBe(true);
    expect(resolveSupportPolicy('withdrawal', 'verified_record').canStateRecord).toBe(true);
  });
});

describe('sensitive support policy boundaries', () => {
  it.each([
    ['Could I be charged twice after checkout timed out?', 'payment'],
    ['退款什么时候到账？', 'refund'],
    ['Bila pengeluaran akan diproses?', 'withdrawal'],
    ['我的身份证审核要多久？', 'kyc'],
    ['Where is my booking?', null],
  ] as const)('classifies %s as %s', (question, domain) => {
    expect(detectSensitiveSupportDomain(question)).toBe(domain);
  });

  it('only offers read, refresh, or human handoff actions when a record is unavailable', () => {
    expect(allowedSupportActions('payment', 'unavailable')).toEqual([
      'refresh_status', 'open_record', 'handoff',
    ]);
    expect(allowedSupportActions('refund', 'verified_record')).toEqual([
      'open_record', 'handoff',
    ]);
    expect(allowedSupportActions('payment', 'unavailable')).not.toContain('pay_again');
  });

  it('does not treat a published policy article as a verified personal record', () => {
    expect(resolveSupportPolicy('refund', 'published_kb')).toMatchObject({
      canAnswerPolicy: true,
      canStateRecord: false,
    });
    expect(resolveSupportPolicy('refund', 'verified_record')).toMatchObject({
      canAnswerPolicy: false,
      canStateRecord: true,
    });
  });
});
