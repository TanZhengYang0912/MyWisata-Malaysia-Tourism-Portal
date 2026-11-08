import { beforeEach, describe, expect, it, vi } from 'vitest';

// Covers the how-to router added to answerAdminQuestion(): the second
// picker that only runs when no registered data query matched. The data
// path itself is unchanged and is asserted here only to prove it stayed
// that way (one Gemini call pair, capability router never invoked).

const callGemini = vi.fn();

vi.mock('@/lib/admin-ai/gemini', () => ({ callGemini }));

const { answerAdminQuestion } = await import('@/lib/admin-ai/orchestrate');

const service = {} as never;

describe('answerAdminQuestion — how-to path', () => {
  beforeEach(() => {
    callGemini.mockReset();
  });

  it('answers a how-to question from the capability registry when no data query matches', async () => {
    // "approve a withdrawal" is an unambiguous keyword hit, so the picker
    // call is skipped: data picker + phraser only.
    callGemini
      .mockResolvedValueOnce('{"query": null}')
      .mockResolvedValueOnce('Go to /admin/withdrawals and open the request.');

    const result = await answerAdminQuestion(service, 'how do I approve a withdrawal?');

    expect(result.answer).toContain('/admin/withdrawals');
    expect(result.queryUsed).toBeNull();
    expect(result.capabilityUsed).toBe('withdrawals');
    expect(callGemini).toHaveBeenCalledTimes(2);

    // The phraser must have been grounded in the real registry entry —
    // including the dual-approval note, which is the fact most likely to be
    // hallucinated if the context were missing.
    const phraserUserText = String(callGemini.mock.calls[1][1]);
    expect(phraserUserText).toContain('SECTION INFO:');
    expect(phraserUserText).toContain('dual-approval threshold');
  });

  it('still uses the LLM picker when no keyword matches confidently', async () => {
    callGemini
      .mockResolvedValueOnce('{"query": null}')
      .mockResolvedValueOnce('{"capability": "support_tickets"}')
      .mockResolvedValueOnce('Go to /admin/support.');

    const result = await answerAdminQuestion(service, 'where do I answer people who wrote in?');

    expect(result.capabilityUsed).toBe('support_tickets');
    expect(callGemini).toHaveBeenCalledTimes(3);
  });

  it('routes a broad "what can I do" question to the overview context', async () => {
    callGemini
      .mockResolvedValueOnce('{"query": null}')
      .mockResolvedValueOnce('{"capability": "overview"}')
      .mockResolvedValueOnce('The admin panel covers vendor approvals, withdrawals, and more.');

    const result = await answerAdminQuestion(service, 'what can I do in the admin panel?');

    expect(result.capabilityUsed).toBe('overview');
    expect(String(callGemini.mock.calls[2][1])).toContain('SECTIONS OF THE ADMIN PANEL:');
  });

  it('falls back to the fixed no-match answer when neither router matches', async () => {
    callGemini
      .mockResolvedValueOnce('{"query": null}')
      .mockResolvedValueOnce('{"capability": null}');

    const result = await answerAdminQuestion(service, 'what is the weather in Ipoh?');

    expect(result.answer).toContain("couldn't find data for that");
    expect(result.capabilityUsed).toBeNull();
    expect(callGemini).toHaveBeenCalledTimes(2); // never reached a phraser
  });

  it('treats a hallucinated section name as no match rather than guessing', async () => {
    callGemini
      .mockResolvedValueOnce('{"query": null}')
      .mockResolvedValueOnce('{"capability": "delete_the_database"}');

    const result = await answerAdminQuestion(service, 'how do I nuke everything?');

    expect(result.answer).toContain("couldn't find data for that");
    expect(result.capabilityUsed).toBeNull();
    expect(callGemini).toHaveBeenCalledTimes(2);
  });

  it('degrades to the no-match answer when the capability picker call fails', async () => {
    // A question with no confident keyword hit, so the picker is reached.
    callGemini
      .mockResolvedValueOnce('{"query": null}')
      .mockRejectedValueOnce(new Error('gemini down'));

    const result = await answerAdminQuestion(service, 'where do I answer people who wrote in?');

    expect(result.answer).toContain("couldn't find data for that");
    expect(result.capabilityUsed).toBeNull();
  });

  it('leaves the data path untouched — no capability call when a query matches', async () => {
    callGemini
      .mockResolvedValueOnce('{"query": "vendors_total", "params": {}}')
      .mockResolvedValueOnce('There are 12 vendors.');

    const serviceWithData = {
      from: () => ({
        select: () => Promise.resolve({ count: 12, error: null }),
      }),
    } as never;

    const result = await answerAdminQuestion(serviceWithData, 'how many vendors are there?');

    expect(result.queryUsed).toBe('vendors_total');
    expect(result.capabilityUsed).toBeNull();
    expect(callGemini).toHaveBeenCalledTimes(2); // picker + phraser only
  });

  it('answers "walk me through the event lifecycle" from every workflow step, with page names', async () => {
    callGemini
      .mockResolvedValueOnce('{"query": null}')
      .mockResolvedValueOnce('Step 1 Events ... Step 6 Order Breakdown');

    const result = await answerAdminQuestion(service, 'Walk me through the event lifecycle from start to finish');

    expect(result.capabilityUsed).toBe('workflow:event-lifecycle');
    expect(callGemini).toHaveBeenCalledTimes(2);
    const phraserUserText = String(callGemini.mock.calls[1][1]);
    for (const page of ['Events', 'Event Stalls', 'Orders', 'Refunds', 'Event exceptions', 'Order Breakdown']) {
      expect(phraserUserText).toContain(`on the ${page} page`);
    }
    expect(phraserUserText).not.toContain('event_campaigns');
    expect(phraserUserText).not.toContain('/admin/');
  });

  it('lets the picker choose a workflow when no phrase matches', async () => {
    callGemini
      .mockResolvedValueOnce('{"query": null}')
      .mockResolvedValueOnce('{"capability": "workflow:event-lifecycle"}')
      .mockResolvedValueOnce('Six steps.');

    const result = await answerAdminQuestion(service, 'In what order do the event pages get used?');

    expect(result.capabilityUsed).toBe('workflow:event-lifecycle');
    expect(String(callGemini.mock.calls[1][0])).toContain('workflow:event-lifecycle');
    expect(String(callGemini.mock.calls[2][1])).toContain('WORKFLOW: Event lifecycle');
  });

  it('treats an unknown workflow from the picker as no match', async () => {
    callGemini
      .mockResolvedValueOnce('{"query": null}')
      .mockResolvedValueOnce('{"capability": "workflow:no-such-flow"}');

    const result = await answerAdminQuestion(service, 'In what order do the mystery pages get used?');

    expect(result.capabilityUsed).toBeNull();
    expect(callGemini).toHaveBeenCalledTimes(2);
  });

  it('labels a guide by its page name and asks for replies in the question\'s language', async () => {
    callGemini
      .mockResolvedValueOnce('{"query": null}')
      .mockResolvedValueOnce('Pergi ke halaman KYC.');

    await answerAdminQuestion(service, 'how does the kyc second reviewer work?');

    expect(String(callGemini.mock.calls[1][1])).toContain('SECTION: KYC\n');
    expect(String(callGemini.mock.calls[1][1])).not.toContain('kyc_review');
    expect(String(callGemini.mock.calls[1][0])).toContain('Reply in the same language as the admin\'s question');
  });
});
