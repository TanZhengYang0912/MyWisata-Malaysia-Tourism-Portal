import { describe, expect, it, vi, beforeEach } from 'vitest';

const getUser = vi.fn();
const createClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient }));

const createServiceClient = vi.fn();
vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));

const translateMessage = vi.fn();
vi.mock('@/lib/chat/translate', () => ({ translateMessage }));

const { POST } = await import('../route');

const MESSAGE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function request(body: unknown) {
  return new Request('http://localhost/api/chat/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Chainable query builder stub matching the shape the route calls. */
function queryStub(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  return builder;
}

describe('POST /api/chat/translate', () => {
  let serviceFrom: ReturnType<typeof vi.fn>;
  let authFrom: ReturnType<typeof vi.fn>;
  let upsert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    authFrom = vi.fn();
    createClient.mockResolvedValue({ auth: { getUser }, from: authFrom });

    upsert = vi.fn().mockResolvedValue({ error: null });
    serviceFrom = vi.fn();
    createServiceClient.mockReturnValue({ from: serviceFrom });
  });

  it('requires sign-in', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const response = await POST(request({ messageId: MESSAGE_ID, targetLang: 'bm' }));
    expect(response.status).toBe(401);
  });

  it('rejects a request for a message in a thread the caller cannot see', async () => {
    serviceFrom.mockReturnValue(queryStub({ data: { id: MESSAGE_ID, thread_id: 'thread-1', body: 'Hello' }, error: null }));
    authFrom.mockReturnValue(queryStub({ data: null, error: null })); // RLS miss = not a participant

    const response = await POST(request({ messageId: MESSAGE_ID, targetLang: 'bm' }));
    expect(response.status).toBe(403);
    expect(translateMessage).not.toHaveBeenCalled();
  });

  it('returns a cached translation without calling the LLM again', async () => {
    serviceFrom.mockImplementation((table: string) => {
      if (table === 'chat_messages') return queryStub({ data: { id: MESSAGE_ID, thread_id: 'thread-1', body: 'Hello' }, error: null });
      if (table === 'chat_message_translations') return queryStub({ data: { translated_text: 'Helo' }, error: null });
      throw new Error(`unexpected table ${table}`);
    });
    authFrom.mockReturnValue(queryStub({ data: { id: 'thread-1', customer_id: USER_ID, outlet_id: 'outlet-1' }, error: null }));

    const response = await POST(request({ messageId: MESSAGE_ID, targetLang: 'bm' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ translatedText: 'Helo', cached: true });
    expect(translateMessage).not.toHaveBeenCalled();
  });

  it('translates, caches, and returns the fresh translation on a cache miss', async () => {
    serviceFrom.mockImplementation((table: string) => {
      if (table === 'chat_messages') return queryStub({ data: { id: MESSAGE_ID, thread_id: 'thread-1', body: 'Hello, is this available?' }, error: null });
      if (table === 'chat_message_translations') {
        const stub = queryStub({ data: null, error: null });
        stub.upsert = upsert;
        return stub;
      }
      throw new Error(`unexpected table ${table}`);
    });
    authFrom.mockReturnValue(queryStub({ data: { id: 'thread-1', customer_id: USER_ID, outlet_id: 'outlet-1' }, error: null }));
    translateMessage.mockResolvedValue('Helo, ini tersedia?');

    const response = await POST(request({ messageId: MESSAGE_ID, targetLang: 'bm' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ translatedText: 'Helo, ini tersedia?', cached: false });
    expect(translateMessage).toHaveBeenCalledWith('Hello, is this available?', 'bm');
    expect(upsert).toHaveBeenCalledWith(
      { message_id: MESSAGE_ID, target_lang: 'bm', translated_text: 'Helo, ini tersedia?' },
      { onConflict: 'message_id,target_lang' },
    );
  });

  it('fails gracefully (not a crash) when the LLM call throws', async () => {
    serviceFrom.mockImplementation((table: string) => {
      if (table === 'chat_messages') return queryStub({ data: { id: MESSAGE_ID, thread_id: 'thread-1', body: 'Hello' }, error: null });
      if (table === 'chat_message_translations') return queryStub({ data: null, error: null });
      throw new Error(`unexpected table ${table}`);
    });
    authFrom.mockReturnValue(queryStub({ data: { id: 'thread-1', customer_id: USER_ID, outlet_id: 'outlet-1' }, error: null }));
    translateMessage.mockRejectedValue(new Error('Gemini timed out'));

    const response = await POST(request({ messageId: MESSAGE_ID, targetLang: 'zh' }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error.code).toBe('TRANSLATE_FAILED');
  });

  it('rejects an invalid target language', async () => {
    const response = await POST(request({ messageId: MESSAGE_ID, targetLang: 'fr' }));
    expect(response.status).toBe(422);
    expect(createServiceClient).not.toHaveBeenCalled();
  });
});
