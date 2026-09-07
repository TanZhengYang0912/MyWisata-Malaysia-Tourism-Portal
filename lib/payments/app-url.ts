const BILL_CODE_PATTERN = /^[A-Za-z0-9]{8}$/;

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

export function resolvePaymentAppUrl(): string {
  const configured = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) throw new Error('payment_app_url_invalid');

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('payment_app_url_invalid');
  }

  const production = process.env.NODE_ENV === 'production';
  const https = url.protocol === 'https:';
  const localHttp = !production && url.protocol === 'http:' && isLocalHostname(url.hostname);
  if (
    (!https && !localHttp)
    || Boolean(url.username || url.password)
    || url.pathname !== '/'
    || Boolean(url.search || url.hash)
    || (production && isLocalHostname(url.hostname))
  ) {
    throw new Error('payment_app_url_invalid');
  }

  return url.origin;
}

export function resolveToyyibPayActionUrl(providerPaymentId: string): string {
  if (!BILL_CODE_PATTERN.test(providerPaymentId)) throw new Error('toyyibpay_invalid_response');
  const environment = process.env.TOYYIBPAY_ENV?.trim().toLowerCase() || 'sandbox';
  const configuredBaseUrl = process.env.TOYYIBPAY_BASE_URL?.trim().replace(/\/$/, '') ?? '';

  if (environment === 'production') {
    if (configuredBaseUrl !== 'https://toyyibpay.com') throw new Error('toyyibpay_not_configured');
    return `https://toyyibpay.com/${providerPaymentId}`;
  }
  if (
    !['sandbox', 'development'].includes(environment)
    || (configuredBaseUrl && configuredBaseUrl !== 'https://dev.toyyibpay.com')
  ) {
    throw new Error('toyyibpay_not_configured');
  }
  return `https://dev.toyyibpay.com/${providerPaymentId}`;
}
