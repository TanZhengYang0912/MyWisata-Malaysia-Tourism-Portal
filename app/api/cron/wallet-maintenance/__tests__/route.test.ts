import { describe, expect, it, vi } from 'vitest';

const post = vi.hoisted(() => vi.fn());
vi.mock('@/app/api/internal/wallet-maintenance/route', () => ({ POST: post }));

import { GET } from '../route';

describe('GET /api/cron/wallet-maintenance', () => {
  it('forwards Vercel Cron authorization to the maintenance job', async () => {
    post.mockResolvedValue(new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }));
    const request = new Request('http://localhost/api/cron/wallet-maintenance', { headers: { authorization: 'Bearer cron-secret' } });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' }));
  });
});
