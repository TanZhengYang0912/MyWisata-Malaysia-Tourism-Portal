type ChatPreviewMessage = {
  id: string;
  senderRole: 'customer' | 'vendor';
};

export function truncateChatMessage(text: string, maxLength = 72): string {
  const normalized = text.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function countUnreadMessages(
  messages: ChatPreviewMessage[],
  readMessageIds: Set<string>,
  viewerRole: 'customer' | 'vendor' = 'customer',
): number {
  const counterpartRole = viewerRole === 'customer' ? 'vendor' : 'customer';
  return messages.filter((message) => message.senderRole === counterpartRole && !readMessageIds.has(message.id)).length;
}

export function formatChatTimestamp(value: string, now = Date.now()): string {
  const timestamp = new Date(value).getTime();
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h`;

  const date = new Date(timestamp);
  return date.getFullYear() === new Date(now).getFullYear()
    ? date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
    : date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}
