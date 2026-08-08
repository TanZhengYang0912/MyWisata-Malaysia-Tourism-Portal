import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimed: [] as unknown[],
  sendRecommendationEmail: vi.fn(async () => ({ id: 'recommendation-message-1' })),
  sendTransactionEmail: vi.fn(async () => ({ id: 'transaction-message-1' })),
}));

vi.mock('@/lib/email/sender', () => ({
  sendAccountEmail: vi.fn(),
  sendRecommendationEmail: mocks.sendRecommendationEmail,
  sendTransactionEmail: mocks.sendTransactionEmail,
  sendVendorEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'email_outbox') {
        return {
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    rpc: async () => ({ data: mocks.claimed, error: null }),
  }),
}));

const templates = await import('@/lib/email/templates');
const { processEmailOutbox } = await import('@/lib/email/outbox');

describe('recommendation approval email', () => {
  beforeEach(() => {
    mocks.claimed = [];
    mocks.sendRecommendationEmail.mockClear();
    mocks.sendTransactionEmail.mockClear();
  });

  it('provides a customer-facing approval template', () => {
    const render = (templates as Record<string, unknown>).renderRecommendationEmail;
    expect(render).toBeTypeOf('function');
    if (typeof render !== 'function') return;

    const result = render({
      eventType: 'recommendation_approved',
      recipientName: 'Aina',
      vendorName: 'Kedai <Amanah>',
      occurredAt: '2026-08-07T02:00:00.000Z',
    }) as { subject: string; html: string; text: string };

    expect(result.subject).toBe('Your recommendation was approved');
    expect(result.html).toContain('Kedai &lt;Amanah&gt;');
    expect(result.text).toContain('Kedai <Amanah>');
  });

  it('dispatches approval rows through the recommendation sender', async () => {
    mocks.claimed = [{
      id: 'outbox-1',
      to_email: 'customer@example.com',
      event_type: 'recommendation_approved',
      payload: {
        recipientName: 'Aina',
        vendorName: 'Kedai Amanah',
        occurredAt: '2026-08-07T02:00:00.000Z',
      },
      status: 'sending',
      attempts: 1,
    }];

    await expect(processEmailOutbox()).resolves.toEqual({ sent: 1, failed: 0 });
    expect(mocks.sendRecommendationEmail).toHaveBeenCalledWith({
      eventType: 'recommendation_approved',
      recipientName: 'Aina',
      vendorName: 'Kedai Amanah',
      occurredAt: '2026-08-07T02:00:00.000Z',
      to: 'customer@example.com',
    });
    expect(mocks.sendTransactionEmail).not.toHaveBeenCalled();
  });
});
