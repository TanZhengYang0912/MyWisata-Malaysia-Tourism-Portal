import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), isSuperAdmin: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));

import { POST } from '../route';

const documentId = 'b21e0b10-00c9-4388-9cac-488149ec8331';
const revisionId = 'cb799d9c-0065-44a7-a6ee-c57acfb626ed';

function context() {
  return { params: Promise.resolve({ id: documentId }) };
}

function request(body: unknown) {
  return new Request(`http://localhost/api/admin/chatbot/kb/${documentId}/publish`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('POST /api/admin/chatbot/kb/[id]/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({ data: { documentId, published: true }, error: null });
  });

  it('publishes only an explicitly confirmed revision for the requested document', async () => {
    const response = await POST(request({ revisionId, expectedContentVersion: 4, confirmed: true }), context());
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('publish_chatbot_kb_revision', {
      p_document_id: documentId,
      p_revision_id: revisionId,
      p_reviewer_id: 'admin-1',
      p_expected_content_version: 4,
      p_confirmed: true,
    });
  });

  it('requires super-admin and never invokes the publish RPC for unauthorized users', async () => {
    mocks.isSuperAdmin.mockResolvedValue(false);
    const response = await POST(request({ revisionId, expectedContentVersion: 4, confirmed: true }), context());
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('shows a safe source-required action instead of database details', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'chatbot_kb_source_required' } });
    const response = await POST(request({ revisionId, expectedContentVersion: 4, confirmed: true }), context());
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body.error.message).toContain('source reference');
    expect(JSON.stringify(body)).not.toContain('chatbot_kb_source_required');
  });
});
