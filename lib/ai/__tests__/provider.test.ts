import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { generateAiText } from '@/lib/ai/provider';

describe('generateAiText', () => {
  beforeEach(() => {
    delete process.env.QWEN_API_KEY;
    delete process.env.QWEN_MODEL;
    delete process.env.QWEN_FALLBACK_MODEL;
    delete process.env.QWEN_BASE_URL;
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.DASHSCOPE_BASE_URL;
    delete process.env.MODELSCOPE_API_KEY;
    delete process.env.MODELSCOPE_MODEL;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    delete process.env.QWEN_API_KEY;
    delete process.env.QWEN_MODEL;
    delete process.env.QWEN_FALLBACK_MODEL;
    delete process.env.QWEN_BASE_URL;
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.DASHSCOPE_BASE_URL;
    delete process.env.MODELSCOPE_API_KEY;
    delete process.env.MODELSCOPE_MODEL;
  });

  it('reports a safe unavailable result when no provider is configured', async () => {
    await expect(generateAiText('system', 'user')).resolves.toEqual({ available: false, reason: 'not_configured' });
  });

  it('reports a privacy block before the missing-provider state for sensitive input', async () => {
    await expect(generateAiText('system', 'Call me at 012-3456789')).resolves.toEqual({ available: false, reason: 'sensitive_input' });
  });

  it('uses the ModelScope OpenAI-compatible endpoint when its key is configured', async () => {
    process.env.MODELSCOPE_API_KEY = 'test-token';
    process.env.MODELSCOPE_MODEL = 'test-model';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Draft copy' } }] }), { status: 200 }));

    await expect(generateAiText('system', 'user')).resolves.toMatchObject({ available: true, provider: 'modelscope', model: 'test-model', content: 'Draft copy' });
    expect(fetchMock).toHaveBeenCalledWith('https://api-inference.modelscope.cn/v1/chat/completions', expect.objectContaining({ method: 'POST' }));
  });

  it('blocks private address and contact data before provider requests', async () => {
    process.env.MODELSCOPE_API_KEY = 'test-token';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Draft copy' } }] }), { status: 200 }));

    await expect(generateAiText('system', 'My home address is 12 Jalan Merpati, George Town.')).resolves.toEqual({ available: false, reason: 'sensitive_input' });
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(generateAiText('system', 'Call me at 012-3456789')).resolves.toEqual({ available: false, reason: 'sensitive_input' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports invalid provider credentials separately from a transient outage', async () => {
    process.env.MODELSCOPE_API_KEY = 'test-token';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Authentication failed' } }), { status: 401 }));

    await expect(generateAiText('system', 'user')).resolves.toEqual({ available: false, reason: 'authentication_failed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('can cap provider attempts for globally budgeted background work', async () => {
    process.env.QWEN_API_KEY = 'test-token';
    process.env.QWEN_MODEL = 'primary';
    process.env.QWEN_FALLBACK_MODEL = 'fallback';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unavailable', { status: 503 }));

    await expect(generateAiText('system', 'user', { maxProviderAttempts: 1 })).resolves.toEqual({ available: false, reason: 'unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forwards an abort signal and stops retrying when the caller cancels', async () => {
    process.env.MODELSCOPE_API_KEY = 'test-token';
    const controller = new AbortController();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => new Promise((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));

    const result = generateAiText('system', 'user', { signal: controller.signal });
    controller.abort();

    await expect(result).resolves.toEqual({ available: false, reason: 'unavailable' });
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: controller.signal }));
  });

  it('limits provider attempts when the caller sets maxProviderAttempts', async () => {
    process.env.QWEN_API_KEY = 'test-token';
    process.env.QWEN_MODEL = 'primary-model';
    process.env.QWEN_FALLBACK_MODEL = 'fallback-model';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('unavailable', { status: 503 }));

    await expect(generateAiText('system', 'user', { maxProviderAttempts: 1 })).resolves.toEqual({ available: false, reason: 'unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).model).toBe('primary-model');
  });
});
