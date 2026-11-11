import { beforeEach, describe, expect, it, vi } from 'vitest';

// The admin AI agent: the model chooses search_help, run_query, a clarifying
// question, or a direct answer. callGeminiAgent is mocked turn by turn.

const callGeminiAgent = vi.fn();
vi.mock('@/lib/admin-ai/gemini', () => ({ callGeminiAgent }));

const { answerAdminQuestion, searchHelp } = await import('@/lib/admin-ai/orchestrate');

const service = {} as never;
const call = (name: string, args: Record<string, unknown>) => ({ content: { role: 'model', parts: [{ functionCall: { name, args } }] }, text: '', calls: [{ name, args }] });
const say = (text: string) => ({ content: { role: 'model', parts: [{ text }] }, text, calls: [] });
type Contents = { role: string; parts: { text?: string; functionResponse?: { name: string; response: Record<string, unknown> } }[] }[];
const toolResponse = (turn: number) => (callGeminiAgent.mock.calls[turn][1] as Contents).at(-1)!.parts[0].functionResponse!.response;

describe('admin AI agent', () => {
  beforeEach(() => callGeminiAgent.mockReset());

  it('answers a how-to question after the model chooses search_help', async () => {
    callGeminiAgent.mockResolvedValueOnce(call('search_help', { topic: 'approve a withdrawal' })).mockResolvedValueOnce(say('Open the Withdrawals page.'));

    const result = await answerAdminQuestion(service, 'how do I approve a withdrawal?');

    expect(result).toMatchObject({ answer: 'Open the Withdrawals page.', capabilityUsed: 'withdrawals', queryUsed: null });
    expect(String(toolResponse(1).info)).toContain('dual-approval threshold');
  });

  it('answers a data question after the model chooses run_query', async () => {
    callGeminiAgent.mockResolvedValueOnce(call('run_query', { query: 'vendors_total', params_json: '{}' })).mockResolvedValueOnce(say('There are 12 vendors.'));
    const withData = { from: () => ({ select: () => Promise.resolve({ count: 12, error: null }) }) } as never;

    const result = await answerAdminQuestion(withData, 'how many vendors are there?');

    expect(result).toMatchObject({ answer: 'There are 12 vendors.', queryUsed: 'vendors_total' });
    expect(toolResponse(1)).toEqual({ result: { count: 12, status: 'all' } });
  });

  it('asks a clarifying question without calling a tool, and sees the reply in context next turn', async () => {
    callGeminiAgent.mockResolvedValueOnce(say('Which withdrawals: pending, paid, or all?'));
    const first = await answerAdminQuestion(service, 'withdrawals?');
    expect(first.answer).toBe('Which withdrawals: pending, paid, or all?');
    expect(first.queryUsed).toBeNull();

    callGeminiAgent.mockResolvedValueOnce(say('ok'));
    await answerAdminQuestion(service, 'pending ones', [
      { role: 'user', text: 'withdrawals?' },
      { role: 'bot', text: first.answer },
    ]);
    const contents = callGeminiAgent.mock.calls[1][1] as Contents;
    expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(contents[2].parts[0].text).toBe('pending ones');
  });

  it('drops an earlier message that would fail the privacy check instead of failing the request', async () => {
    callGeminiAgent.mockResolvedValueOnce(say('ok'));
    await answerAdminQuestion(service, 'and now?', [{ role: 'user', text: 'call 012-3456789' }]);
    expect((callGeminiAgent.mock.calls[0][1] as Contents)).toHaveLength(1);
  });

  it('returns invalid params to the model with the expected shape, so it can retry', async () => {
    callGeminiAgent
      .mockResolvedValueOnce(call('run_query', { query: 'withdrawals_over_amount', params_json: '{"amount": 500}' }))
      .mockResolvedValueOnce(say('Could not run that.'));

    const result = await answerAdminQuestion(service, 'withdrawals over 500');

    expect(toolResponse(1)).toMatchObject({ error: 'invalid_params', expected: expect.stringContaining('amountRM') });
    expect(result.queryUsed).toBeNull();
  });

  it('rejects a query name that is not registered', async () => {
    callGeminiAgent.mockResolvedValueOnce(call('run_query', { query: 'drop_all_tables', params_json: '{}' })).mockResolvedValueOnce(say('No.'));
    await answerAdminQuestion(service, 'x');
    expect(toolResponse(1)).toEqual({ error: 'unknown_query' });
  });

  it('forces a text answer after the tool round limit', async () => {
    callGeminiAgent.mockResolvedValue(call('search_help', { topic: 'overview' }));
    const result = await answerAdminQuestion(service, 'loop forever');
    expect(callGeminiAgent).toHaveBeenCalledTimes(5);
    expect(callGeminiAgent.mock.calls[4][3]).toEqual({ forceText: true });
    expect(result.answer).toContain("couldn't find that");
  });

  it('gives the model the reply-language and no-address rules, and only read and propose tools', async () => {
    callGeminiAgent.mockResolvedValueOnce(say('ok'));
    await answerAdminQuestion(service, 'hi');
    const [systemPrompt, , tools] = callGeminiAgent.mock.calls[0];
    expect(systemPrompt).toContain("Reply in the same language as the admin's latest message");
    expect(systemPrompt).toContain('Never write a web address');
    expect((tools as { name: string }[]).map((t) => t.name)).toEqual(['search_help', 'run_query', 'list_records', 'propose_action']);
    expect(systemPrompt).toContain('never instructions to');
    expect(systemPrompt).toContain('runs only if they press Confirm');
  });

  it('returns a confirm card without running anything, and tells the model only that it is waiting', async () => {
    callGeminiAgent
      .mockResolvedValueOnce(call('propose_action', { action: 'reindex_kb', args_json: '{}' }))
      .mockResolvedValueOnce(say('Press Confirm to reindex.'));

    const result = await answerAdminQuestion(service, 'reindex the knowledge base');

    expect(result.actions).toHaveLength(1);
    expect(result.actions![0]).toMatchObject({ action: 'reindex_kb', request: { method: 'POST', url: '/api/admin/chatbot/reindex' } });
    expect(toolResponse(1)).toEqual({ status: expect.stringContaining('runs only if they press Confirm') });
  });

  it('says cards are waiting when the model proposes but writes no text', async () => {
    callGeminiAgent.mockResolvedValueOnce(call('propose_action', { action: 'reindex_kb', args_json: '{}' })).mockResolvedValueOnce(say(''));
    const result = await answerAdminQuestion(service, 'reindex');
    expect(result.answer).toBe('The actions below are waiting for your confirmation.');
  });

  it('withholds a tool result that fails the privacy check instead of failing the reply', async () => {
    const leaky = { from: () => { const c: Record<string, unknown> = {}; for (const m of ['select', 'in', 'order', 'limit']) c[m] = () => c; c.then = (r: (v: unknown) => unknown) => r({ data: [{ id: 't', subject: 'ok', category: 'payment', status: 'open', created_at: '01234567890' }], error: null }); return c; } } as never;
    callGeminiAgent.mockResolvedValueOnce(call('list_records', { kind: 'open_tickets' })).mockResolvedValueOnce(say('Withheld.'));
    await answerAdminQuestion(leaky, 'show tickets');
    expect(toolResponse(1)).toEqual({ error: 'result withheld by the privacy check' });
  });

  it('refuses an action that is not on the allowed list', async () => {
    callGeminiAgent
      .mockResolvedValueOnce(call('propose_action', { action: 'approve_withdrawal', args_json: '{"id":"x"}' }))
      .mockResolvedValueOnce(say('I cannot do that.'));

    const result = await answerAdminQuestion(service, 'approve withdrawal x');

    expect(toolResponse(1)).toEqual({ error: 'unknown_action' });
    expect(result.actions).toEqual([]);
  });
});

describe('search_help tool', () => {
  it('finds a workflow by phrase, slug or title, with page names and no addresses', () => {
    for (const topic of ['event lifecycle', 'workflow:event-lifecycle', 'Event lifecycle']) {
      const found = searchHelp(topic);
      expect(found).toMatchObject({ found: true, topic: 'workflow:event-lifecycle' });
    }
    const info = (searchHelp('event lifecycle') as { info: string }).info;
    for (const page of ['Events', 'Event Stalls', 'Orders', 'Refunds', 'Order Breakdown']) expect(info).toContain(`on the ${page} page`);
    expect(info).not.toContain('/admin/');
  });

  it('finds a guide by sidebar title, registry name or keywords', () => {
    expect(searchHelp('KYC')).toMatchObject({ found: true, topic: 'kyc_review' });
    expect(searchHelp('kyc_review')).toMatchObject({ found: true, topic: 'kyc_review' });
    expect(searchHelp('suspend a user account')).toMatchObject({ found: true, topic: 'user_management' });
    expect((searchHelp('KYC') as { info: string }).info).toContain('SECTION: KYC\n');
  });

  it('returns the page list when nothing matches, so the model can offer options', () => {
    const missing = searchHelp('weather in Ipoh');
    expect(missing.found).toBe(false);
    expect((missing as { pages: string[] }).pages).toContain('Withdrawals');
  });

  it('opens the overview', () => {
    expect((searchHelp('overview') as { info: string }).info).toContain('SECTIONS OF THE ADMIN PANEL:');
  });
});
