import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc: mocks.rpc }) }));

import { bindChatbotGuestSessionToken } from '../guest-session';

describe('bindChatbotGuestSessionToken', () => {
  beforeEach(() => vi.clearAllMocks());

  it('distinguishes a completed binding from a definite non-binding result', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { bound: true }, error: null })
      .mockResolvedValueOnce({ data: { bound: false }, error: null });

    await expect(bindChatbotGuestSessionToken('session-1', 'a'.repeat(64))).resolves.toBe('bound');
    await expect(bindChatbotGuestSessionToken('session-1', 'a'.repeat(64))).resolves.toBe('not_bound');
  });

  it('distinguishes an RPC outage from a definite non-binding result', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'database unavailable' } })
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ data: null, error: null });

    await expect(bindChatbotGuestSessionToken('session-1', 'a'.repeat(64))).resolves.toBe('unavailable');
    await expect(bindChatbotGuestSessionToken('session-1', 'a'.repeat(64))).resolves.toBe('unavailable');
    await expect(bindChatbotGuestSessionToken('session-1', 'a'.repeat(64))).resolves.toBe('unavailable');
  });
});
