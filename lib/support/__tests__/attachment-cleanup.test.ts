import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServiceClient = vi.fn();
const remove = vi.fn();
const claim = vi.fn();
const finish = vi.fn();
const CLEANUP_TOKEN = '7b456ed4-615e-4210-a704-840abc4c1790';
const UPLOAD_ID = '11111111-1111-4111-8111-111111111111';

vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));

const { cleanupSupportAttachments } = await import('../attachment-cleanup');

describe('cleanupSupportAttachments', () => {
  beforeEach(() => {
    createServiceClient.mockReset().mockReturnValue({
      rpc: (name: string, args?: unknown) => name === 'claim_support_attachment_cleanup' ? claim(name, args) : finish(name, args),
      storage: { from: () => ({ remove }) },
    });
    claim.mockReset().mockResolvedValue({ data: { token: CLEANUP_TOKEN, items: [] }, error: null });
    finish.mockReset().mockResolvedValue({ data: { deleted: 0, rescheduled: 0 }, error: null });
    remove.mockReset().mockResolvedValue({ data: {}, error: null });
  });

  it('does not call storage when the bounded claim is empty', async () => {
    await expect(cleanupSupportAttachments()).resolves.toEqual({ claimed: 0, deleted: 0, rescheduled: 0 });
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes only claimed objects and finalizes with the claim token', async () => {
    claim.mockResolvedValue({
      data: { token: CLEANUP_TOKEN, items: [{ id: UPLOAD_ID, storage_path: '22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.pdf' }] },
      error: null,
    });
    finish.mockResolvedValue({ data: { deleted: 1, rescheduled: 0 }, error: null });

    await expect(cleanupSupportAttachments()).resolves.toEqual({ claimed: 1, deleted: 1, rescheduled: 0 });
    expect(remove).toHaveBeenCalledWith(['22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.pdf']);
    expect(finish).toHaveBeenCalledWith('finish_support_attachment_cleanup', {
      p_token: CLEANUP_TOKEN,
      p_deleted_ids: [UPLOAD_ID],
      p_failed_ids: [],
    });
  });

  it('records storage deletion failures for retry instead of reporting success', async () => {
    claim.mockResolvedValue({
      data: { token: CLEANUP_TOKEN, items: [{ id: UPLOAD_ID, storage_path: '22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.pdf' }] },
      error: null,
    });
    remove.mockResolvedValue({ data: null, error: new Error('storage unavailable') });
    finish.mockResolvedValue({ data: { deleted: 0, rescheduled: 1 }, error: null });

    await expect(cleanupSupportAttachments()).resolves.toEqual({ claimed: 1, deleted: 0, rescheduled: 1 });
    expect(finish).toHaveBeenCalledWith('finish_support_attachment_cleanup', {
      p_token: CLEANUP_TOKEN,
      p_deleted_ids: [],
      p_failed_ids: [UPLOAD_ID],
    });
  });
});
