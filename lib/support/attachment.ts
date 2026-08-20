// P4 — Member 4: support ticket attachments. Reuses the chat attachment
// validator as-is (file-type/size/magic-byte checks — nothing chat-specific
// about it) rather than duplicating it; only the storage path convention
// differs (ticket id instead of thread id as the folder segment).

import { extensionForMime } from '@/lib/chat/attachment';

export { validateChatAttachment } from '@/lib/chat/attachment';

export function buildTicketAttachmentPath(ticketId: string, token: string, mimeType: string): string {
  return `${ticketId}/${token}.${extensionForMime(mimeType)}`;
}
