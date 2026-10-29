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
