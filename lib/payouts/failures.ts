import type { PayoutProviderName, ProviderFailure } from './providers';

function redactProviderMessage(value: string | null | undefined): string | null {
  if (!value) return null;
  return value
    .replace(/(password|pass|token|secret|auth(?:orization)?)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/\b(?:sk|rk|pk|pi|ch|cs|re|cus|acct|pm|src|tok|seti|evt|whsec)_[A-Za-z0-9_-]+\b/gi, '[redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted]')
    .replace(/\+\d{1,3}(?:[\s().-]*\d){7,14}/g, '[redacted]')
    .replace(/\b01\d(?:[\s().-]*\d){7,8}\b/g, '[redacted]')
    .slice(0, 500);
}

export function normalizeProviderFailure(input: {
  provider: PayoutProviderName;
  code?: string | null;
  message?: string | null;
}): ProviderFailure {
  const code = input.code?.trim() || null;
  const lower = `${code ?? ''} ${input.message ?? ''}`.toLowerCase();
  const category: ProviderFailure['category'] =
    /timeout|timed out|network|temporar/.test(lower) ? 'timeout' :
    /not_configured|not configured/.test(lower) ? 'not_configured' :
    /closed|disabled|suspended|deactivated/.test(lower) ? 'account_disabled' :
    /invalid.*(destination|account)|destination.*invalid|recipient.*invalid/.test(lower) ? 'invalid_destination' :
    /reject|declin|blocked|denied/.test(lower) ? 'provider_rejected' :
    'unknown';

  return {
    code,
    message: redactProviderMessage(input.message),
    category,
    retryable: category === 'timeout',
  };
}
