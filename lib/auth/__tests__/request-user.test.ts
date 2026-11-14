import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '../request-user';

function clientFor(result: unknown): SupabaseClient {
  return {
    auth: { getUser: vi.fn().mockResolvedValue(result) },
  } as unknown as SupabaseClient;
}

describe('getAuthenticatedUser', () => {
  it('treats a missing session and explicit 401 as unauthenticated', async () => {
    await expect(getAuthenticatedUser(clientFor({
      data: { user: null }, error: { name: 'AuthSessionMissingError' },
    }))).resolves.toEqual({ state: 'unauthenticated' });
    await expect(getAuthenticatedUser(clientFor({
      data: { user: null }, error: { status: 401 },
    }))).resolves.toEqual({ state: 'unauthenticated' });
  });

  it('keeps a temporarily unavailable auth service distinct from an expired session', async () => {
    const error = { name: 'AuthRetryableFetchError', status: 503 };

    await expect(getAuthenticatedUser(clientFor({ data: { user: null }, error })))
      .resolves.toEqual({ state: 'unavailable', error });
  });

  it('handles both thrown auth errors and an empty error-free result', async () => {
    const error = new Error('network connection lost');
    const throwingClient = {
      auth: { getUser: vi.fn().mockRejectedValue(error) },
    } as unknown as SupabaseClient;

    await expect(getAuthenticatedUser(throwingClient)).resolves.toEqual({ state: 'unavailable', error });
    await expect(getAuthenticatedUser(clientFor({ data: { user: null }, error: null })))
      .resolves.toEqual({ state: 'unauthenticated' });
  });

  it('returns the verified user only when getUser succeeds', async () => {
    const user = { id: 'customer-1' };

    await expect(getAuthenticatedUser(clientFor({ data: { user }, error: null })))
      .resolves.toEqual({ state: 'authenticated', user });
  });
});
