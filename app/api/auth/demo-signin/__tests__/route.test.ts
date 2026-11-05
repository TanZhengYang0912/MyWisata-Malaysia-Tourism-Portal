import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithPassword = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { signInWithPassword } })) }));

import { POST } from '../route';

function request() {
  return new Request('http://localhost/api/auth/demo-signin', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'customer@demo.local', captchaToken: 'valid-proof' }),
  });
}

describe('POST /api/auth/demo-signin runtime gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MYLAWATAN_DEMO_TOOLS', 'false');
    vi.stubEnv('MYLAWATAN_ENV', '');
    vi.stubEnv('VERCEL_ENV', '');
  });

  it('is not reachable when demo tools are disabled', async () => {
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('permits the seeded login only in an explicitly enabled safe runtime', async () => {
    vi.stubEnv('MYLAWATAN_DEMO_TOOLS', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    signInWithPassword.mockResolvedValue({ error: null });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'customer@demo.local', password: 'demo123456', options: { captchaToken: 'valid-proof' } });
  });

  it('returns a stable CAPTCHA error code without exposing the provider message', async () => {
    vi.stubEnv('MYLAWATAN_DEMO_TOOLS', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    signInWithPassword.mockResolvedValue({ error: { code: 'captcha_failed', message: 'request disallowed (invalid-input-response)' } });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: 'captcha_failed' });
  });

  it('returns a generic error code for other provider failures', async () => {
    vi.stubEnv('MYLAWATAN_DEMO_TOOLS', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    signInWithPassword.mockResolvedValue({ error: { code: 'unexpected_error', message: 'private provider detail' } });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: 'sign_in_failed' });
  });

  it('does not expose unexpected exception messages', async () => {
    vi.stubEnv('MYLAWATAN_DEMO_TOOLS', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    signInWithPassword.mockRejectedValue(new Error('private server detail'));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: 'sign_in_failed' });
  });
});
