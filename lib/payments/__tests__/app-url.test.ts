import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolvePaymentAppUrl } from '@/lib/payments/app-url';

describe('resolvePaymentAppUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses the trusted server APP_URL origin and strips a trailing slash', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', 'https://mywisata.example/');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://public-fallback.example');

    expect(resolvePaymentAppUrl()).toBe('https://mywisata.example');
  });

  it('falls back to the configured public app origin', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://mywisata.example');

    expect(resolvePaymentAppUrl()).toBe('https://mywisata.example');
  });

  it.each([
    'https://user:password@mywisata.example',
    'https://mywisata.example/path',
    'https://mywisata.example?next=evil',
    'javascript:alert(1)',
    'http://mywisata.example',
    'http://localhost:3000',
  ])('rejects an unsafe production application URL: %s', (value) => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', value);

    expect(() => resolvePaymentAppUrl()).toThrow('payment_app_url_invalid');
  });

  it('permits HTTP localhost only outside production', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('APP_URL', 'http://localhost:3000');

    expect(resolvePaymentAppUrl()).toBe('http://localhost:3000');
  });
});
