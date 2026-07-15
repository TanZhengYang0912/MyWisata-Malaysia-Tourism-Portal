import { describe, expect, it } from 'vitest';
import { countUnreadMessages, formatChatTimestamp, truncateChatMessage } from '@/lib/customer/chat-view';

describe('customer chat view helpers', () => {
  it('truncates long previews without cutting the visible copy awkwardly', () => {
    expect(truncateChatMessage('Is this child friendly for a six year old?', 24)).toBe('Is this child friendly…');
    expect(truncateChatMessage('Short message', 24)).toBe('Short message');
  });

  it('counts only unread messages sent by the vendor', () => {
    const messages = [
      { id: 'vendor-unread', senderRole: 'vendor' as const },
      { id: 'vendor-read', senderRole: 'vendor' as const },
      { id: 'customer-message', senderRole: 'customer' as const },
    ];
    expect(countUnreadMessages(messages, new Set(['vendor-read']))).toBe(1);
  });

  it('counts only unread messages sent by the customer when viewed as a vendor', () => {
    const messages = [
      { id: 'customer-unread', senderRole: 'customer' as const },
      { id: 'customer-read', senderRole: 'customer' as const },
    ];
    expect(countUnreadMessages(messages, new Set(['customer-read']), 'vendor')).toBe(1);
  });

  it('formats recent timestamps for a compact conversation list', () => {
    const now = new Date('2026-07-14T12:00:00.000Z').getTime();
    expect(formatChatTimestamp('2026-07-14T11:45:00.000Z', now)).toBe('15m');
    expect(formatChatTimestamp('2026-07-13T12:00:00.000Z', now)).toBe('13 Jul');
  });
});
