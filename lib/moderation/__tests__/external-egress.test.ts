import { afterEach, describe, expect, it, vi } from 'vitest';
import { moderateBio, moderateWalletReason } from '@/lib/moderation';

describe('moderation external egress', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('withholds the complete profile text when it contains Malaysian IC or phone values', async () => {
    vi.stubEnv('GOOGLE_AI_KEY', 'test-key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await moderateBio('990101-14-5678 +6012-3456789');
    expect(result).toEqual({ error: 'sensitive_data_detected' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks bank, KYC, and address context without making an external call', async () => {
    vi.stubEnv('GOOGLE_AI_KEY', 'test-key');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(moderateWalletReason('My bank account is 123456789012', 'hold', 'risk_review_required'))
      .resolves.toEqual({ error: 'sensitive_data_detected' });
    await expect(moderateBio('My home is 12 Jalan Merpati, George Town'))
      .resolves.toEqual({ error: 'sensitive_data_detected' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
