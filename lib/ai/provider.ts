import 'server-only';
import { prepareExternalText } from '@/lib/chatbot/pii';

export type AiProvider = 'qwencloud' | 'modelscope' | 'gemini';
export type AiUnavailableReason = 'not_configured' | 'authentication_failed' | 'rate_limited' | 'sensitive_input' | 'unavailable';

export type AiTextResult =
  | { available: true; provider: AiProvider; model: string; content: string }
  | { available: false; reason: AiUnavailableReason };

type ProviderConfig = {
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  models: string[];
};

function providerConfig(provider?: 'gemini'): ProviderConfig | null {
  if (provider === 'gemini') {
    const apiKey = process.env.LLM_API_KEY?.trim();
    if (!apiKey) return null;
    return {
      provider: 'gemini',
      apiKey,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
      models: ['gemini-flash-lite-latest'],
    };
  }

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
  options: { provider?: 'gemini'; temperature?: number; maxTokens?: number; signal?: AbortSignal; maxProviderAttempts?: number; json?: boolean } = {},
): Promise<AiTextResult> {
  const preparedPrompt = prepareExternalText(userPrompt);
  if (!preparedPrompt.allowed) return { available: false, reason: 'sensitive_input' };
  const config = providerConfig(options.provider);
  if (!config) return { available: false, reason: 'not_configured' };

  const maxTokens = Math.min(1200, Math.max(100, Math.floor(options.maxTokens ?? 500)));
  let sawRateLimit = false;

  const providerAttempts = Math.min(config.models.length, Math.max(1, Math.floor(options.maxProviderAttempts ?? config.models.length)));
  for (const model of config.models.slice(0, providerAttempts)) {
    if (options.signal?.aborted) return { available: false, reason: 'unavailable' };
    try {
      const isGemini = config.provider === 'gemini';
      const response = await fetch(
        isGemini
          ? `${config.baseUrl}/${encodeURIComponent(model)}:generateContent`
          : `${config.baseUrl.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: isGemini
            ? { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey }
            : { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(isGemini
            ? {
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                generationConfig: {
                  temperature: options.temperature ?? 0.35,
                  maxOutputTokens: maxTokens,
                  ...(options.json ? { responseMimeType: 'application/json' } : {}),
                },
              }
            : {
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
        },
      );

      if (response.status === 429) {
        sawRateLimit = true;
        continue;
      }
      if (response.status === 401 || response.status === 403) {
        console.warn(`[ai] ${config.provider} authentication failed for ${model} (HTTP ${response.status})`);
        return { available: false, reason: 'authentication_failed' };
      }
      if (!response.ok) {
        console.warn(`[ai] ${config.provider} request failed for ${model} (HTTP ${response.status})`);
        continue;
      }

      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: unknown } }>;
        candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
      };
      const geminiParts = payload.candidates?.[0]?.content?.parts;
      const content = config.provider === 'gemini'
        ? geminiParts?.map((part) => typeof part.text === 'string' ? part.text : '').join('')
        : payload.choices?.[0]?.message?.content;
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
