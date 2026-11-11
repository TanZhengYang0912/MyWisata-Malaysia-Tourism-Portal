import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServiceClient = vi.fn();
const remove = vi.fn();
const claim = vi.fn();
const finish = vi.fn();
const claimReconciliation = vi.fn();
const finishReconciliation = vi.fn();
const CLEANUP_TOKEN = '7b456ed4-615e-4210-a704-840abc4c1790';
const UPLOAD_ID = '11111111-1111-4111-8111-111111111111';
const OPERATION_ID = '22222222-2222-4222-8222-222222222222';
const STORAGE_PATH = '33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.pdf';

vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));

const { cleanupSupportAttachments, reconcileSupportAttachments } = await import('../attachment-cleanup');

describe('cleanupSupportAttachments', () => {
  beforeEach(() => {
    createServiceClient.mockReset().mockReturnValue({
      rpc: (name: string, args?: unknown) => {
        if (name === 'claim_support_attachment_cleanup') return claim(name, args);
        if (name === 'finish_support_attachment_cleanup') return finish(name, args);
        if (name === 'claim_support_attachment_reconciliation') return claimReconciliation(name, args);
        return finishReconciliation(name, args);
      },
      storage: { from: () => ({ remove, download }) },
    });
    claim.mockReset().mockResolvedValue({ data: { token: CLEANUP_TOKEN, items: [] }, error: null });
    finish.mockReset().mockResolvedValue({ data: { deleted: 0, rescheduled: 0 }, error: null });
    claimReconciliation.mockReset().mockResolvedValue({ data: { token: CLEANUP_TOKEN, items: [] }, error: null });
    finishReconciliation.mockReset().mockResolvedValue({ data: { state: 'unknown' }, error: null });
    remove.mockReset().mockResolvedValue({ data: {}, error: null });
    download.mockReset().mockResolvedValue({ data: null, error: { statusCode: '404' } });
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

const download = vi.fn();

describe('reconcileSupportAttachments', () => {
  beforeEach(() => {
    createServiceClient.mockReset().mockReturnValue({
      rpc: (name: string, args?: unknown) => {
        if (name === 'claim_support_attachment_reconciliation') return claimReconciliation(name, args);
        return finishReconciliation(name, args);
      },
      storage: { from: () => ({ download }) },
    });
    claimReconciliation.mockReset().mockResolvedValue({ data: { token: CLEANUP_TOKEN, items: [] }, error: null });
    finishReconciliation.mockReset().mockResolvedValue({ data: { state: 'unknown' }, error: null });
    download.mockReset().mockResolvedValue({ data: null, error: { statusCode: '404' } });
  });

  it('does not call storage when no expired upload lease is claimed', async () => {
    await expect(reconcileSupportAttachments()).resolves.toEqual({ claimed: 0, recovered: 0, unknown: 0 });
    expect(download).not.toHaveBeenCalled();
  });

  it('marks an object recovered only when its registered size and SHA-256 match', async () => {
    const content = Buffer.from('verified attachment');
    const { createHash } = await import('node:crypto');
    claimReconciliation.mockResolvedValue({
      data: { token: CLEANUP_TOKEN, items: [{
        id: UPLOAD_ID,
        operation_id: OPERATION_ID,
        storage_path: STORAGE_PATH,
        server_sha256: createHash('sha256').update(content).digest('hex'),
        size_bytes: content.length,
      }] },
      error: null,
    });
    download.mockResolvedValue({ data: new Blob([content], { type: 'application/pdf' }), error: null });
    finishReconciliation.mockResolvedValue({ data: { state: 'uploaded' }, error: null });

    await expect(reconcileSupportAttachments()).resolves.toEqual({ claimed: 1, recovered: 1, unknown: 0 });
    expect(download).toHaveBeenCalledWith(STORAGE_PATH);
    expect(finishReconciliation).toHaveBeenCalledWith('finish_support_attachment_reconciliation', {
      p_operation_id: OPERATION_ID,
      p_token: CLEANUP_TOKEN,
      p_object_verified: true,
    });
  });

  it('leaves missing or mismatched objects unknown for bounded retry', async () => {
    claimReconciliation.mockResolvedValue({
      data: { token: CLEANUP_TOKEN, items: [{
        id: UPLOAD_ID,
        operation_id: OPERATION_ID,
        storage_path: STORAGE_PATH,
        server_sha256: 'a'.repeat(64),
        size_bytes: 4,
      }] },
      error: null,
    });
    download.mockResolvedValue({ data: new Blob(['bad!']), error: null });

    await expect(reconcileSupportAttachments()).resolves.toEqual({ claimed: 1, recovered: 0, unknown: 1 });
    expect(finishReconciliation).toHaveBeenCalledWith('finish_support_attachment_reconciliation', {
      p_operation_id: OPERATION_ID,
      p_token: CLEANUP_TOKEN,
      p_object_verified: false,
    });
  });
});
