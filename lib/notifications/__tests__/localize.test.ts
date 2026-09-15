import { describe, expect, it } from 'vitest';
import { localizeNotification } from '@/lib/notifications/localize';

const translate = (key: string, options?: Record<string, unknown>) =>
  JSON.stringify({ key, options: options ?? {} });

describe('notification localization', () => {
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
