import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), update: vi.fn(), send: vi.fn(), paused: vi.fn() }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc: mocks.rpc,
  from: () => ({ update: mocks.update }),
}) }));
vi.mock('@/lib/email/sender', () => ({ sendVendorEmail: mocks.send, sendAccountEmail: vi.fn(),
  sendRecommendationEmail: vi.fn(), sendTransactionEmail: vi.fn(), sendKycSecurityEmail: vi.fn(),
}));
vi.mock('@/lib/platform/operations-settings', () => ({ isPlatformOperationEnabled: mocks.paused, PLATFORM_OPERATION_KEYS: { pauseCustomDelivery: 'email.pause_custom_delivery' } }));
import { processEmailOutbox } from '../outbox';

const row = { id: '11111111-1111-4111-8111-111111111111', lease_token: '22222222-2222-4222-8222-222222222222',
  to_email: 'synthetic@example.test', event_type: 'vendor_order_update', attempts: 1,
  payload: { vendorName: 'Synthetic kitchen', reason: 'Synthetic pickup review', reference: 'MW-TEST' } };

describe('email delivery interruption boundaries', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.paused.mockResolvedValue(false);
    mocks.update.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    mocks.rpc.mockImplementation(async (name) => ({ data: name === 'claim_email_outbox_delivery_v2'
      ? { rows: [row], recovered: 0, reviewRequired: 0 }
      : name === 'claim_email_outbox' ? [row] : true, error: null }));
    mocks.send.mockImplementation(async (input) => { await input.delivery?.beforeSend(); return { id: 'smtp-accepted' }; });
  });
  it('uses the guarded claim and records accepted delivery without raw row updates', async () => {
    expect(await processEmailOutbox()).toEqual({ sent: 1, failed: 0, reviewRequired: 0 });
    expect(mocks.rpc).toHaveBeenCalledWith('claim_email_outbox_delivery_v2', { p_limit: 2 });
    expect(mocks.rpc).toHaveBeenCalledWith('begin_email_outbox_delivery', { p_id: row.id, p_token: row.lease_token });
    expect(mocks.rpc).toHaveBeenCalledWith('finish_email_outbox_delivery', expect.objectContaining({ p_id: row.id, p_token: row.lease_token, p_outcome: 'sent', p_message_id: 'smtp-accepted' }));
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('caps explicit outbox batches at two rows', async () => {
    await processEmailOutbox(20);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_email_outbox_delivery_v2', { p_limit: 2 });
  });
  it('sends a stale persisted locale or reason code as English with the reason verbatim', async () => {
    mocks.rpc.mockImplementation(async (name) => ({ data: name === 'claim_email_outbox_delivery_v2'
      ? { rows: [{ ...row, payload: { ...row.payload, locale: 'zh-CN', reasonCode: 'pickup_review', reasonDetails: 'MW-TEST · 2 × Cake' } }], reviewRequired: 0 }
      : true, error: null }));
    await processEmailOutbox();
    const sent = mocks.send.mock.calls.at(-1)![0];
    expect(sent).toMatchObject({ reason: row.payload.reason });
    expect(sent).not.toHaveProperty('locale');
    expect(sent).not.toHaveProperty('reasonCode');
    expect(sent).not.toHaveProperty('reasonDetails');
  });
  it('retries only acknowledgement after SMTP acceptance; never converts it to failed', async () => {
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name, args) => name === 'finish_email_outbox_delivery'
      ? Promise.resolve({ error: new Error('private database details') }) : original(name, args));
    await expect(processEmailOutbox()).rejects.toThrow('email_state_unavailable');
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const finishes = mocks.rpc.mock.calls.filter(([name]) => name === 'finish_email_outbox_delivery');
    expect(finishes).toHaveLength(3);
    expect(finishes.every(([, args]) => args.p_outcome === 'sent')).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('does not send after a stale claim loses its token', async () => {
    const original = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementation((name, args) => name === 'begin_email_outbox_delivery'
      ? Promise.resolve({ data: false, error: null }) : original(name, args));
    await expect(processEmailOutbox()).rejects.toThrow('email_state_unavailable');
    expect(mocks.rpc.mock.calls.some(([name, args]) => name === 'finish_email_outbox_delivery' && args.p_outcome === 'sent')).toBe(false);
  });
  it('keeps a post-start unknown SMTP outcome for review instead of automatic retry', async () => {
    mocks.send.mockImplementation(async (input) => { await input.delivery.beforeSend(); throw new Error('private SMTP DATA timeout'); });
    expect(await processEmailOutbox()).toEqual({ sent: 0, failed: 0, reviewRequired: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith('finish_email_outbox_delivery', expect.objectContaining({ p_outcome: 'unknown' }));
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain('private SMTP');
  });
  it('reports existing review obligations even when no mail is claimable', async () => {
    mocks.rpc.mockResolvedValue({ data: { rows: [], recovered: 1, reviewRequired: 2 }, error: null });
    expect(await processEmailOutbox()).toEqual({ sent: 0, failed: 0, reviewRequired: 2 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('keeps queued rows untouched and does not claim them while custom delivery is paused', async () => {
    mocks.paused.mockResolvedValue(true);
    expect(await processEmailOutbox()).toEqual({ sent: 0, failed: 0, reviewRequired: 0 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
