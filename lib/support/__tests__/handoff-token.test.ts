import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ insert: vi.fn(), select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ from: () => ({ insert: mocks.insert, select: mocks.select, eq: mocks.eq, maybeSingle: mocks.maybeSingle }) }) }));

import { createHandoffToken, verifyHandoffToken } from '../handoff-token';

describe('handoff preview token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insert.mockResolvedValue({ error: null });
    mocks.select.mockReturnThis();
    mocks.eq.mockReturnThis();
    mocks.maybeSingle.mockResolvedValue({
      data: { owner_id: 'owner-1', content_hash: 'b'.repeat(64), expires_at: new Date(Date.now() + 60_000).toISOString() },
      error: null,
    });
  });

  it('stores only hashes and returns an opaque random token', async () => {
    const token = await createHandoffToken('owner-1', 'Booking issue', 'My booking is missing', '33333333-3333-4333-8333-333333333333');
    const record = mocks.insert.mock.calls[0][0] as Record<string, unknown>;

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(token).not.toContain('Booking issue');
    expect(JSON.stringify(record)).not.toContain('My booking is missing');
    expect(JSON.stringify(record)).not.toContain('33333333-3333-4333-8333-333333333333');
    expect(record.token_hash).not.toBe(token);
    expect(record.content_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifies owner and reviewed content without exposing preview fields in the token', async () => {
    const token = await createHandoffToken('owner-1', 'Booking issue', 'My booking is missing');
    const record = mocks.insert.mock.calls[0][0] as { content_hash: string };
    mocks.maybeSingle.mockResolvedValue({ data: { owner_id: 'owner-1', content_hash: record.content_hash, expires_at: new Date(Date.now() + 60_000).toISOString() }, error: null });

    await expect(verifyHandoffToken(token, 'owner-1', 'Booking issue', 'My booking is missing')).resolves.toBe(true);
    await expect(verifyHandoffToken(token, 'owner-2', 'Booking issue', 'My booking is missing')).resolves.toBe(false);
    await expect(verifyHandoffToken(token, 'owner-1', 'Changed title', 'My booking is missing')).resolves.toBe(false);
    await expect(verifyHandoffToken(`${token}x`, 'owner-1', 'Booking issue', 'My booking is missing')).resolves.toBe(false);
  });
});
