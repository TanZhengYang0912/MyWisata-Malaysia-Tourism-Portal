import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), isSuperAdmin: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));

import { PATCH } from '../route';

const documentId = 'b21e0b10-00c9-4388-9cac-488149ec8331';
const versionedDraft = {
  title: 'Refund status',
  body: 'Check your account page.',
  keywords: ['refund'],
  category: 'payment',
  sourceRefs: ['https://example.test/refunds'],
  expectedContentVersion: 3,
};

function context() {
  return { params: Promise.resolve({ id: documentId }) };
}

function request(body: unknown) {
  return new Request(`http://localhost/api/admin/chatbot/kb/${documentId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

describe('PATCH /api/admin/chatbot/kb/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({ data: { documentId, revisionId: 'revision-1', changed: true, contentVersion: 3 }, error: null });
  });

  it('stores an edit as a versioned draft without a read-then-write sequence', async () => {
    const response = await PATCH(request(versionedDraft), context());
    expect(response.status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('save_chatbot_kb_revision', expect.objectContaining({
      p_document_id: documentId,
      p_author_id: 'admin-1',
      p_expected_content_version: 3,
      p_source_refs: ['https://example.test/refunds'],
      p_operation_id: null,
    }));
  });

  it('returns an unchanged revision result without client-side writes or embedding work', async () => {
    mocks.rpc.mockResolvedValue({ data: { documentId, revisionId: null, changed: false, contentVersion: 3 }, error: null });

    const response = await PATCH(request(versionedDraft), context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ changed: false, contentVersion: 3 });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('refuses direct activation and requires the publish flow', async () => {
    const response = await PATCH(request({ isActive: true }), context());
    const body = await response.json();
    expect(response.status).toBe(422);
    expect(body.error.code).toBe('KB_REVIEW_REQUIRED');
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
