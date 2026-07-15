import { beforeEach, describe, expect, it, vi } from 'vitest';

const { processEmailOutbox } = vi.hoisted(() => ({ processEmailOutbox: vi.fn() }));
vi.mock('@/lib/email/outbox', () => ({ processEmailOutbox }));

import { POST } from '@/app/api/internal/email-outbox/process/route';

describe('email outbox process route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EMAIL_OUTBOX_SECRET = 'test-secret';
    processEmailOutbox.mockResolvedValue({ sent: 1, failed: 0 });
  });

  it('rejects requests without the internal secret', async () => {
    const response = await POST(new Request('http://localhost/api/internal/email-outbox/process', { method: 'POST' }));
    expect(response.status).toBe(401);
    expect(processEmailOutbox).not.toHaveBeenCalled();
  });

  it('processes a bounded batch with the internal secret', async () => {
    const response = await POST(new Request('http://localhost/api/internal/email-outbox/process', {
      method: 'POST',
      headers: { 'x-email-outbox-secret': 'test-secret', 'content-type': 'application/json' },
      body: JSON.stringify({ limit: 200 }),
    }));
    expect(response.status).toBe(200);
    expect(processEmailOutbox).toHaveBeenCalledWith(100);
  });
});
