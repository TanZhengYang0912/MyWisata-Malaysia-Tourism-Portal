import { afterEach, describe, expect, it, vi } from 'vitest';
import { embedText } from '../embed';

describe('embedText external call boundary', () => {
  afterEach(() => {
    delete process.env.LLM_API_KEY;
    vi.unstubAllGlobals();
  });

  it('marks the operation before sending text to Gemini', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const events: string[] = [];
    const fetchMock = vi.fn(async () => {
      events.push('provider');
      return new Response(JSON.stringify({ embedding: { values: Array(768).fill(0.1) } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const beforeExternalCall = vi.fn(async () => { events.push('marked'); });

    await embedText('How do I change my booking?', 'user', beforeExternalCall);

    expect(events).toEqual(['marked', 'provider']);
    expect(beforeExternalCall).toHaveBeenCalledTimes(1);
  });

  it('does not send text to Gemini when recording the operation fails', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const beforeExternalCall = vi.fn(async () => { throw new Error('lease lost'); });

    await expect(embedText('How do I change my booking?', 'user', beforeExternalCall)).rejects.toThrow('lease lost');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(beforeExternalCall).toHaveBeenCalledTimes(1);
  });
});
