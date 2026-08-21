import 'server-only';

export type AiProvider = 'qwencloud' | 'modelscope';
export type AiUnavailableReason = 'not_configured' | 'authentication_failed' | 'rate_limited' | 'unavailable';

export type AiTextResult =
  | { available: true; provider: AiProvider; model: string; content: string }
  | { available: false; reason: AiUnavailableReason };

type ProviderConfig = {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  models: string[];
};

function providerConfig(): ProviderConfig | null {
  const qwenKey = process.env.QWEN_API_KEY?.trim() || process.env.DASHSCOPE_API_KEY?.trim();
  if (qwenKey) {
    const primary = process.env.QWEN_MODEL?.trim() || 'qwen-flash-2025-07-28';
    const fallback = process.env.QWEN_FALLBACK_MODEL?.trim();
    return {
      provider: 'qwencloud',
      apiKey: qwenKey,
      baseUrl: process.env.QWEN_BASE_URL?.trim() || process.env.DASHSCOPE_BASE_URL?.trim() || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      models: [...new Set([primary, fallback].filter((model): model is string => Boolean(model)))],
    };
  }

  const modelScopeKey = process.env.MODELSCOPE_API_KEY?.trim();
  if (!modelScopeKey) return null;
  const primary = process.env.MODELSCOPE_MODEL?.trim() || process.env.MODELSCOPE_FALLBACK_MODEL?.trim() || 'Qwen/Qwen3-32B';
  return {
    provider: 'modelscope',
    apiKey: modelScopeKey,
    baseUrl: process.env.MODELSCOPE_BASE_URL?.trim() || 'https://api-inference.modelscope.cn/v1',
    models: [primary],
  };
}

export async function generateAiText(
  systemPrompt: string,
  userPrompt: string,
  options: { temperature?: number; maxTokens?: number; signal?: AbortSignal } = {},
): Promise<AiTextResult> {
  const config = providerConfig();
  if (!config) return { available: false, reason: 'not_configured' };

  const maxTokens = Math.min(1200, Math.max(100, Math.floor(options.maxTokens ?? 500)));
  let sawRateLimit = false;

  for (const model of config.models) {
    if (options.signal?.aborted) return { available: false, reason: 'unavailable' };
    try {
      const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: options.temperature ?? 0.35,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: maxTokens,
        }),
        cache: 'no-store',
        signal: options.signal,
      });

      if (response.status === 429) {
        sawRateLimit = true;
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        console.warn(`[ai] ${config.provider} authentication failed for ${model} (HTTP ${response.status})`);
        return { available: false, reason: 'authentication_failed' };
      }
      if (!response.ok) {
        const detail = (await response.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 240);
        console.warn(`[ai] ${config.provider} request failed for ${model} (HTTP ${response.status})${detail ? `: ${detail}` : ''}`);
        continue;
      }

      const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      const content = payload.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) {
        return { available: true, provider: config.provider, model, content: content.trim() };
      }
    } catch (error) {
      if (options.signal?.aborted) return { available: false, reason: 'unavailable' };
      console.error('[ai] provider request failed', error instanceof Error ? error.message : error);
    }
  }

  return { available: false, reason: sawRateLimit ? 'rate_limited' : 'unavailable' };
}
