import { describe, expect, it } from 'vitest';
import { localizeNotification } from '@/lib/notifications/localize';

const translate = (key: string, options?: Record<string, unknown>) =>
  JSON.stringify({ key, options: options ?? {} });

describe('notification localization', () => {
  it('localizes fixed KYC incident kinds and discards arbitrary metadata', () => {
    const result = localizeNotification({ type: 'kyc_security_alert', title: 'KYC security alert', body: 'Review status', metadata: { kind: 'access_volume', count: 10, occurredAt: '2026-10-12T16:00:00Z', privatePath: 'identity/front.jpg' } }, translate);
    expect(result.title).toContain('notifications.events.kycSecurity.title');
    expect(result.body).toContain('notifications.events.kycSecurity.access_volume');
    expect(result.body).not.toContain('identity/front.jpg');
  });
  it.each(['payment_blocked', 'pickup_review', 'refund_pending', 'refund_attention', 'refunded', 'collected', 'no_show'])('localizes event exception phase %s with readable scoped details', (phase) => {
    const result = localizeNotification({ type: `vendor_event_exception_${phase}`, title: 'Event order update', body: 'Fallback', metadata: { orderReference: 'ORD-123', items: '2 × Cake · Main Hall · 2026-10-12 · 10:00–12:00' } }, translate);
    expect(result.title).toContain(`notifications.events.eventException.${phase}.title`);
    expect(result.body).toContain('ORD-123');
    expect(result.body).toContain('2 × Cake');
  });
  it('renders known system events from a stable type and metadata', () => {
    const result = localizeNotification({
      type: 'withdrawal_approved',
      title: 'Withdrawal approved — payout in progress',
      body: 'Your withdrawal has been approved and will be transferred to your account shortly.',
      metadata: { amountRm: 12.5 },
    }, translate);

    expect(result.title).toContain('notifications.events.withdrawalApproved.title');
    expect(result.body).toContain('notifications.events.withdrawalApproved.body');
    expect(result.title).toContain('12.5');
  });

  it('localizes vendor lifecycle titles while keeping staff-entered reasons intact', () => {
    const result = localizeNotification({
      type: 'vendor_suspended',
      title: 'Your vendor "Rasa Malaysia" has been suspended',
      body: 'Please provide updated registration documents.',
      metadata: { vendorName: 'Rasa Malaysia' },
    }, translate);

    expect(result.title).toContain('notifications.events.vendorLifecycle.suspended.title');
    expect(result.title).toContain('Rasa Malaysia');
    expect(result.body).toBe('Please provide updated registration documents.');
  });

  it('keeps legacy vendor lifecycle content unchanged when structured name is missing', () => {
    const result = localizeNotification({
      type: 'vendor_approved',
      title: 'Your vendor "Legacy Shop" has been approved',
      body: 'You can now manage your outlets and products.',
    }, translate);

    expect(result).toEqual({
      title: 'Your vendor "Legacy Shop" has been approved',
      body: 'You can now manage your outlets and products.',
    });
  });

  it('keeps dynamic user text and unknown event types unchanged', () => {
    const result = localizeNotification({
      type: 'withdrawal_rejected',
      title: 'Withdrawal request rejected',
      body: 'Please update your bank account name.',
      metadata: {},
    }, translate);

    expect(result.title).toContain('notifications.events.withdrawalRejected.title');
    expect(result.body).toBe('Please update your bank account name.');

    const unknown = localizeNotification({
      type: 'custom_vendor_message',
      title: 'A vendor supplied title',
      body: 'A vendor supplied body',
      metadata: {},
    }, translate);
    expect(unknown).toEqual({ title: 'A vendor supplied title', body: 'A vendor supplied body' });
  });

  it('preserves recommendation names when legacy rows have no structured metadata', () => {
    const result = localizeNotification({
      type: 'recommendation_approved',
      title: 'Your recommendation "testing 567" was approved',
      body: 'Great find! We will reach out to the vendor soon.',
    }, translate);

    expect(result).toEqual({
      title: 'Your recommendation "testing 567" was approved',
      body: 'Great find! We will reach out to the vendor soon.',
    });
  });

  it('localizes recommendation names when structured metadata is available', () => {
    const result = localizeNotification({
      type: 'recommendation_approved',
      title: 'Your recommendation was approved',
      body: 'Great find! We will reach out to the vendor soon.',
      metadata: { vendorName: 'Testing 567' },
    }, translate);

    expect(result.title).toContain('notifications.events.recommendationApprovedWithName.title');
    expect(result.title).toContain('Testing 567');
  });

  it('falls back when a recommendation name is empty', () => {
    const result = localizeNotification({
      type: 'recommendation_approved',
      title: 'Your recommendation "testing 567" was approved',
      body: 'Great find! We will reach out to the vendor soon.',
      metadata: { vendorName: '  ' },
    }, translate);

    expect(result.title).toBe('Your recommendation "testing 567" was approved');
  });

  it('renders a chat message from metadata, and its attachment variant', () => {
    const text = localizeNotification({
      type: 'chat_message',
      title: 'New message from Ada',
      body: 'stored fallback',
      metadata: { name: 'Ada', preview: 'see you at 3', attachment: false },
    }, translate);
    expect(text.title).toContain('notifications.events.chatMessage.title');
    expect(text.title).toContain('Ada');
    expect(text.body).toBe('see you at 3');

    const attachment = localizeNotification({
      type: 'chat_message',
      title: 'New message from Ada',
      body: 'stored fallback',
      metadata: { name: 'Ada', preview: null, attachment: true },
    }, translate);
    expect(attachment.body).toContain('notifications.events.chatMessage.attachmentBody');
  });

  it('does not overwrite the approver version of withdrawal submitted', () => {
    const result = localizeNotification({
      type: 'withdrawal_submitted',
      title: 'New withdrawal requires review',
      body: 'RM 25.00 withdrawal from customer@example.com requires review.',
      metadata: { withdrawal_id: 'wd_123', approval_cycle: 1 },
    }, translate);

    expect(result).toEqual({
      title: 'New withdrawal requires review',
      body: 'RM 25.00 withdrawal from customer@example.com requires review.',
    });
  });
});
