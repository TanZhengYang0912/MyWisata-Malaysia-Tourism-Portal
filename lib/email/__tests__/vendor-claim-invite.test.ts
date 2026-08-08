import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueueEmail: vi.fn(),
  processEmailOutbox: vi.fn(),
}));

vi.mock('@/lib/email/outbox', () => ({
  enqueueEmail: mocks.enqueueEmail,
  processEmailOutbox: mocks.processEmailOutbox,
}));

import { enqueueVendorClaimInviteEmail } from '@/lib/email/events';

describe('enqueueVendorClaimInviteEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueEmail.mockResolvedValue({ inserted: true, id: 'outbox-1' });
    mocks.processEmailOutbox.mockResolvedValue({ sent: 1, failed: 0 });
  });

  it('writes an idempotent one-time claim URL notification to the email outbox', async () => {
    await enqueueVendorClaimInviteEmail({
      recommendationId: 'rec-1',
      email: 'owner@example.com',
      vendorName: 'Rasa Malaysia Kitchen',
      claimUrl: 'https://example.com/vendor-invite?recommendation=secret-token',
    });

    expect(mocks.enqueueEmail).toHaveBeenCalledWith(expect.objectContaining({
      eventKey: 'vendor_claim_invite:rec-1',
      eventType: 'vendor_account_update',
      toEmail: 'owner@example.com',
      reference: 'https://example.com/vendor-invite?recommendation=secret-token',
    }));
  });
});
