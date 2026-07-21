import { describe, expect, it } from 'vitest';
import { checkPhoneVerification } from '../transaction-gates';

describe('checkPhoneVerification', () => {
  it('blocks missing phone verification with a stable API code', () => {
    expect(checkPhoneVerification(null)).toEqual({
      allowed: false,
      code: 'PHONE_VERIFICATION_REQUIRED',
      message: 'Phone verification is required before booking or purchase.',
    });
  });

  it('allows a verified phone timestamp', () => {
    expect(checkPhoneVerification('2026-07-22T00:00:00.000Z')).toEqual({ allowed: true });
  });
});
