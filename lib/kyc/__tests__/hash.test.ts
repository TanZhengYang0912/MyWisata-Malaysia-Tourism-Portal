import { describe, expect, it } from 'vitest';
import { hashICWithHmac } from '../hash';

describe('hashICWithHmac', () => {
  it('normalizes the IC and returns a versioned SHA-256 HMAC', async () => {
    const compact = await hashICWithHmac('900101145678', 'test-secret');
    const formatted = await hashICWithHmac('900101-14-5678', 'test-secret');

    expect(formatted).toEqual({
      algorithm: 'hmac_sha256_v1',
      value: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(formatted).toEqual(compact);
  });

  it('does not accept an absent HMAC key', async () => {
    await expect(hashICWithHmac('900101145678', '')).rejects.toThrow('KYC_IC_HMAC_KEY');
  });
});
