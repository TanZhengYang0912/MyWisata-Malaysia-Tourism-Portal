import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandoffToken, verifyHandoffToken } from '../handoff-token';

describe('handoff preview token', () => {
  beforeEach(() => vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-signing-secret'));

  it('binds a short-lived token to the owner and reviewed text', async () => {
    const token = await createHandoffToken('owner-1', 'Booking issue', 'My booking is missing');
    await expect(verifyHandoffToken(token, 'owner-1', 'Booking issue', 'My booking is missing')).resolves.toBe(true);
    await expect(verifyHandoffToken(token, 'owner-2', 'Booking issue', 'My booking is missing')).resolves.toBe(false);
    await expect(verifyHandoffToken(token, 'owner-1', 'Changed title', 'My booking is missing')).resolves.toBe(false);
    await expect(verifyHandoffToken(`${token}x`, 'owner-1', 'Booking issue', 'My booking is missing')).resolves.toBe(false);
  });
});
