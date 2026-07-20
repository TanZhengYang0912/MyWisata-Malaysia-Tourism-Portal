import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendVendorEmail: vi.fn(async () => ({ id: 'vendor-message-1' })),
  sendAccountEmail: vi.fn(async () => ({ id: 'account-message-1' })),
  sendTransactionEmail: vi.fn(async () => ({ id: 'transaction-message-1' })),
  upserts: [] as Array<Record<string, unknown>>,
  users: { email: 'owner@example.com', full_name: 'Aina Owner' },
  claimed: [] as unknown[],
}));

vi.mock('@/lib/email/sender', () => ({
  sendVendorEmail: mocks.sendVendorEmail,
  sendAccountEmail: mocks.sendAccountEmail,
  sendTransactionEmail: mocks.sendTransactionEmail,
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'users') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: mocks.users, error: null }) }),
          }),
        };
      }
      if (table === 'email_outbox') {
        return {
          upsert: (payload: Record<string, unknown>) => {
            mocks.upserts.push(payload);
            return { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
          },
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
    rpc: async () => ({ data: mocks.claimed, error: null }),
  }),
}));

import { renderVendorEmail } from '@/lib/email/templates';
import { enqueueVendorEmail } from '@/lib/email/events';
import { processEmailOutbox } from '@/lib/email/outbox';

describe('vendor email events', () => {
  beforeEach(() => {
    mocks.sendVendorEmail.mockClear();
    mocks.sendAccountEmail.mockClear();
    mocks.sendTransactionEmail.mockClear();
    mocks.upserts.length = 0;
    mocks.claimed = [];
  });

  it('renders event details with escaped and redacted values', () => {
    const rendered = renderVendorEmail({
      eventType: 'vendor_order_update',
      recipientName: 'Aina',
      vendorName: 'Kedai <Amanah>',
      reason: '<script>alert(1)</script> payment pi_1234567890',
      reference: 'order_123',
      occurredAt: '2026-07-15T10:00:00.000Z',
    });

    expect(rendered.subject).toContain('order');
    expect(rendered.html).toContain('Kedai &lt;Amanah&gt;');
    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered.html).toContain('order_123');
    expect(rendered.html).not.toContain('pi_1234567890');
  });

  it('redacts financial, identity, contact, and provider secret values everywhere', () => {
    const rendered = renderVendorEmail({
      eventType: 'vendor_account_update',
      vendorName: 'Vendor bank account: 123456789',
      reason: 'passport: P123456; IC: 900101-14-5678; MyKad: 900101145678; DOB: 1990-01-01; email: x@y.example; phone: +60123456789; address: 1 Jalan Aman; whsec_super_secret',
      reference: 'IBAN: MY12TEST1234567890',
      occurredAt: '2026-07-15T10:00:00.000Z',
    });

    for (const sensitiveValue of [
      '123456789',
      'P123456',
      '900101-14-5678',
      '900101145678',
      '1990-01-01',
      'x@y.example',
      '+60123456789',
      '1 Jalan Aman',
      'whsec_super_secret',
      'MY12TEST1234567890',
    ]) {
      expect(rendered.html).not.toContain(sensitiveValue);
      expect(rendered.text).not.toContain(sensitiveValue);
    }
  });

  it('keeps the same event key across repeated enqueue calls', async () => {
    const input = {
      userId: 'user-1',
      eventKey: 'vendor-order:order-1:user-1',
      eventType: 'vendor_order_update' as const,
      vendorName: 'Kedai Amanah',
      reason: 'Order is ready',
      reference: 'order-1',
      occurredAt: '2026-07-15T10:00:00.000Z',
    };

    await enqueueVendorEmail(input);
    await enqueueVendorEmail(input);

    expect(mocks.upserts).toHaveLength(2);
    expect(mocks.upserts.map((row) => row.event_key)).toEqual([
      input.eventKey,
      input.eventKey,
    ]);
  });

  it('dispatches vendor outbox rows through the vendor sender', async () => {
    mocks.claimed = [{
      id: 'outbox-1',
      to_email: 'owner@example.com',
      event_type: 'vendor_order_update',
      payload: {
        recipientName: 'Aina',
        vendorName: 'Kedai Amanah',
        reason: 'Order is ready',
        reference: 'order-1',
        occurredAt: '2026-07-15T10:00:00.000Z',
      },
      status: 'sending',
      attempts: 1,
    }];

    await expect(processEmailOutbox()).resolves.toEqual({ sent: 1, failed: 0 });
    expect(mocks.sendVendorEmail).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'vendor_order_update',
      vendorName: 'Kedai Amanah',
      reference: 'order-1',
      to: 'owner@example.com',
    }));
    expect(mocks.sendTransactionEmail).not.toHaveBeenCalled();
  });
});
