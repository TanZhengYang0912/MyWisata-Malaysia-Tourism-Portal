import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateAnswer } from '../generate';

describe('generateAnswer external privacy boundary', () => {
  afterEach(() => {
    delete process.env.LLM_API_KEY;
    vi.restoreAllMocks();
  });

  it('allows a normal tourism question with travel details and public place names', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'NO_ANSWER' }] } }],
    }), { status: 200 }));
    const question = 'Plan 3 days in Kuala Lumpur for 2 adults, 12–14 Nov 2026, with RM 800 for food near Jalan Alor.';

    await expect(generateAnswer(question, [{ title: 'Food', body: 'Jalan Alor has street food.' }])).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(question);
  });

  it('does not send a retrieved knowledge-base document containing contact data', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    await expect(generateAnswer('How can I visit George Town?', [
      { title: 'Contact', body: 'The customer can be reached at alice@example.com.' },
    ])).rejects.toThrow('sensitive_data_detected');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('generateAnswer multi-question prompt', () => {
  afterEach(() => {
    delete process.env.LLM_API_KEY;
    vi.restoreAllMocks();
  });

  async function requestBody(questionCount?: number) {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Withdrawals take 3 days.' }] } }],
    }), { status: 200 }));
    await generateAnswer('How do I withdraw? Can I cancel?', [{ title: 'Wallet', body: 'Withdrawals take 3 days.' }], questionCount);
    return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
  }

  it('answers covered questions, declines uncovered ones and keeps the money rule', async () => {
    const prompt: string = (await requestBody()).systemInstruction.parts[0].text;
    expect(prompt).toContain('Answer\neach question the context covers');
    expect(prompt).toContain('If the context covers none of the questions, reply with\nexactly:\nNO_ANSWER');
    expect(prompt).toContain('Money, wallet, commission, and withdrawal questions must be answered\nword-for-word from the context or not at all.');
  });

  it('doubles the output budget only when there is more than one question', async () => {
    expect((await requestBody()).generationConfig.maxOutputTokens).toBe(300);
    vi.restoreAllMocks();
    expect((await requestBody(2)).generationConfig.maxOutputTokens).toBe(600);
  });
});

describe('generateAnswer with a mix of safe and blocked docs', () => {
  afterEach(() => {
    delete process.env.LLM_API_KEY;
    vi.restoreAllMocks();
  });

  it('leaves out only the blocked doc and still answers from the rest', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Open Wallet and tap Withdraw.' }] } }],
    }), { status: 200 }));

    await expect(generateAnswer('How do I withdraw?', [
      { title: 'Wallet', body: 'Open Wallet and tap Withdraw.' },
      { title: 'Contact', body: 'The customer can be reached at alice@example.com.' },
    ])).resolves.toBe('Open Wallet and tap Withdraw.');
    const sent = String(fetchMock.mock.calls[0]?.[1]?.body);
    expect(sent).toContain('Open Wallet and tap Withdraw.');
    expect(sent).not.toContain('alice@example.com');
    expect(sent).not.toContain('TITLE: Contact');
  });
});
