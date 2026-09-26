import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithPassword = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { signInWithPassword } })) }));

import { POST } from '../route';

function request() {
  return new Request('http://localhost/api/auth/demo-signin', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'customer@demo.local' }),
  });
}

describe('POST /api/auth/demo-signin runtime gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MYWISATA_DEMO_TOOLS', 'false');
    vi.stubEnv('MYWISATA_ENV', '');
    vi.stubEnv('VERCEL_ENV', '');
  });

  it('is not reachable when demo tools are disabled', async () => {
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('permits the seeded login only in an explicitly enabled safe runtime', async () => {
    vi.stubEnv('MYWISATA_DEMO_TOOLS', 'true');
    vi.stubEnv('NODE_ENV', 'test');
    signInWithPassword.mockResolvedValue({ error: null });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'customer@demo.local', password: 'demo123456' });
  });
});
