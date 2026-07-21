import { describe, expect, it } from 'vitest';
import { isEmailVerified } from '../email-status';

describe('isEmailVerified', () => {
  it('trusts Auth confirmation and falls back to synchronized profile state', () => {
    expect(isEmailVerified('2026-07-22T00:00:00.000Z', null)).toBe(true);
    expect(isEmailVerified(null, '2026-07-21T00:00:00.000Z')).toBe(true);
    expect(isEmailVerified(null, null)).toBe(false);
  });
});
