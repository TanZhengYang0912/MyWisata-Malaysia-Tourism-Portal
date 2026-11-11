import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
  isSuperAdmin: vi.fn(),
  embedText: vi.fn(),
  reserveAiQuota: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock('@/lib/chatbot/embed', () => ({ embedText: mocks.embedText }));
vi.mock('@/lib/rate-limit/ai', () => ({ reserveAiQuota: mocks.reserveAiQuota }));

import { POST } from '../route';

describe('POST /api/admin/chatbot/reindex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('LLM_API_KEY', 'test-key');
    mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) } });
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.createServiceClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.reserveAiQuota.mockResolvedValue(true);
    mocks.embedText.mockResolvedValue(Array(768).fill(0.1));
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'claim_chatbot_kb_reindex') {
        return { data: [{ id: 'doc-1', title: 'Title', body: 'Body', content_version: 2, lease_token: 'lease-1' }], error: null };
      }
      if (name === 'finish_chatbot_kb_reindex') return { data: true, error: null };
      return { data: true, error: null };
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('claims no more than ten documents and commits the embedding through version and lease CAS', async () => {
    const response = await POST(new Request('https://example.test/api/admin/chatbot/reindex'));
    const body = await response.json();

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'claim_chatbot_kb_reindex', { p_limit: 10, p_lease_seconds: 300 });
    expect(mocks.reserveAiQuota).toHaveBeenCalledWith(expect.any(Request), 'kb_embedding', 'admin-1');
    expect(mocks.embedText).toHaveBeenCalledWith('Title\nBody', 'kb');
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'finish_chatbot_kb_reindex', {
      p_id: 'doc-1', p_content_version: 2, p_lease_token: 'lease-1', p_embedding: Array(768).fill(0.1),
    });
    expect(body.data).toMatchObject({ scanned: 1, reindexed: 1, batchSize: 10 });
    expect(response.status).toBe(200);
  });

  it('releases the claim when quota is exhausted without calling the embedding provider', async () => {
    mocks.reserveAiQuota.mockResolvedValue(false);
    const response = await POST(new Request('https://example.test/api/admin/chatbot/reindex'));
    const body = await response.json();

    expect(mocks.embedText).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'release_chatbot_kb_reindex', { p_id: 'doc-1', p_lease_token: 'lease-1' });
    expect(body.data).toMatchObject({ scanned: 1, reindexed: 0 });
  });

  it('does not report success if content changed while the embedding was generated', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'claim_chatbot_kb_reindex') {
        return { data: [{ id: 'doc-1', title: 'Title', body: 'Body', content_version: 2, lease_token: 'lease-1' }], error: null };
      }
      if (name === 'finish_chatbot_kb_reindex') return { data: false, error: null };
      return { data: true, error: null };
    });

    const response = await POST(new Request('https://example.test/api/admin/chatbot/reindex'));
    const body = await response.json();

    expect(body.data.reindexed).toBe(0);
    expect(body.data.errors).toHaveLength(1);
    expect(mocks.rpc).toHaveBeenCalledWith('release_chatbot_kb_reindex', { p_id: 'doc-1', p_lease_token: 'lease-1' });
  });

  it('does not disclose provider configuration names', async () => {
    vi.stubEnv('LLM_API_KEY', '');
    const response = await POST(new Request('https://example.test/api/admin/chatbot/reindex'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain('LLM_API_KEY');
  });

  it('does not return database driver diagnostics', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'ECONNREFUSED 127.0.0.1:5432' } });
    const response = await POST(new Request('https://example.test/api/admin/chatbot/reindex'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(body)).not.toContain('127.0.0.1');
  });
});
