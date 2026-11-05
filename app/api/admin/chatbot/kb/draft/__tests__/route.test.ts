import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  createServiceClient: vi.fn(),
  draftKbEntry: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/chatbot/kb-draft', () => ({ draftKbEntry: mocks.draftKbEntry }));

import { POST } from '../route';

describe('POST /api/admin/chatbot/kb/draft privacy boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(true);
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mocks.createServiceClient.mockReturnValue({ from: vi.fn(() => query) });
  });

  it('withholds a personal-data question before calling the AI drafter', async () => {
    const response = await POST(new Request('http://localhost/api/admin/chatbot/kb/draft', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'My phone number is 012-3456789. How do I book?' }),
    }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe('PERSONAL_DATA_WITHHELD');
    expect(body.error.message).toContain('write the knowledge-base entry manually');
    expect(mocks.draftKbEntry).not.toHaveBeenCalled();
  });
});
