import { beforeEach, describe, expect, it, vi } from 'vitest';

// CLAUDE-ADMIN-CONDUCT.md added one new call to this pre-existing route
// (app/api/admin-ai/ask/route.ts). This file only covers that new
// behavior — the route had no prior test coverage to preserve.

const getUser = vi.fn();
const isSuperAdmin = vi.fn();
const createServiceClient = vi.fn();
const answerAdminQuestion = vi.fn();
const logModerationFlag = vi.fn();
const logAdminConductFlagIfNeeded = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin }));
vi.mock('@/lib/admin-ai/orchestrate', () => ({ answerAdminQuestion }));
vi.mock('@/lib/moderation/flags', () => ({ logModerationFlag }));
vi.mock('@/lib/moderation/admin-conduct', () => ({ logAdminConductFlagIfNeeded }));

const { POST } = await import('../route');

function request(question: string) {
  return new Request('http://localhost/api/admin-ai/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question }),
  });
}

function mockClient() {
  createServiceClient.mockReturnValue({
    from: (table: string) => {
      if (table === 'chatbot_sessions') {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: 'session-1', session_key: 'sess-key-1' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'moderation_custom_words') {
        return { select: () => ({ eq: () => Promise.resolve({ data: [] }) }) };
      }
      return {
        insert: (payload: { role: string }) => {
          if (payload.role === 'bot') return Promise.resolve({ error: null });
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'msg-1' }, error: null }) }) };
        },
      };
    },
  });
}

describe('POST /api/admin-ai/ask — admin conduct flagging', () => {
  beforeEach(() => {
    getUser.mockReset();
    isSuperAdmin.mockReset();
    createServiceClient.mockReset();
    answerAdminQuestion.mockReset().mockResolvedValue({ answer: 'Here you go.', queryUsed: null });
    logModerationFlag.mockReset().mockResolvedValue(undefined);
    logAdminConductFlagIfNeeded.mockReset().mockResolvedValue(undefined);
    getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    isSuperAdmin.mockResolvedValue(true);
    mockClient();
  });

  it('flags admin profanity typed into the assistant, with no target user', async () => {
    const response = await POST(request('why is this fucking metric broken'));

    expect(response.status).toBe(200);
    expect(logAdminConductFlagIfNeeded).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      flaggedAdminId: 'admin-1',
      targetUserId: null,
      source: 'admin_ai',
      sourceRefId: 'sess-key-1',
      cleaned: expect.objectContaining({ hadProfanity: true }),
    }));
  });

  it('calls the flagger with a clean cleaned() result for an ordinary question', async () => {
    // The route always calls logAdminConductFlagIfNeeded — the no-op-when-
    // clean decision lives inside that function (see
    // lib/moderation/__tests__/admin-conduct.test.ts), not at the call
    // site. This just confirms the route hands it accurate content.
    const response = await POST(request('how many withdrawals are pending this week'));

    expect(response.status).toBe(200);
    expect(logAdminConductFlagIfNeeded).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      cleaned: expect.objectContaining({ hadProfanity: false, hadSlur: false }),
    }));
  });

  it('still flags when the question was typed but the assistant call itself fails', async () => {
    answerAdminQuestion.mockRejectedValue(new Error('gemini down'));

    const response = await POST(request('why is this fucking metric broken'));

    expect(response.status).toBe(503);
    expect(logAdminConductFlagIfNeeded).toHaveBeenCalled();
  });
});
