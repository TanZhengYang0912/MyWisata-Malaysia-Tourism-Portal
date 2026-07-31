import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { generateAiText } from '@/lib/ai/provider';

describe('generateAiText', () => {
  beforeEach(() => {
    delete process.env.QWEN_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.MODELSCOPE_API_KEY;
    delete process.env.MODELSCOPE_MODEL;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.QWEN_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.MODELSCOPE_API_KEY;
    delete process.env.MODELSCOPE_MODEL;
  });

  it('reports a safe unavailable result when no provider is configured', async () => {
    await expect(generateAiText('system', 'user')).resolves.toEqual({ available: false, reason: 'not_configured' });
  });

  it('uses the ModelScope OpenAI-compatible endpoint when its key is configured', async () => {
    process.env.MODELSCOPE_API_KEY = 'test-token';
    process.env.MODELSCOPE_MODEL = 'test-model';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Draft copy' } }] }), { status: 200 }));

    await expect(generateAiText('system', 'user')).resolves.toMatchObject({ available: true, provider: 'modelscope', model: 'test-model', content: 'Draft copy' });
    expect(fetchMock).toHaveBeenCalledWith('https://api-inference.modelscope.cn/v1/chat/completions', expect.objectContaining({ method: 'POST' }));
  });

  it('reports invalid provider credentials separately from a transient outage', async () => {
    process.env.MODELSCOPE_API_KEY = 'test-token';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Authentication failed' } }), { status: 401 }));

    await expect(generateAiText('system', 'user')).resolves.toEqual({ available: false, reason: 'authentication_failed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
