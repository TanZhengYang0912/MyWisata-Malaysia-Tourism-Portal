// P4 — Member 4: support ticket attachments. Reuses the chat attachment
// validator as-is (file-type/size/magic-byte checks — nothing chat-specific
// about it) rather than duplicating it; only the storage path convention
// differs (ticket id instead of thread id as the folder segment).

import { extensionForMime } from '@/lib/chat/attachment';

export { validateChatAttachment } from '@/lib/chat/attachment';

const MAX_ATTACHMENT_MULTIPART_BYTES = 10 * 1024 * 1024 + 64 * 1024;

export type TicketAttachmentFormResult =
  | { ok: true; data: FormData }
  | { ok: false; reason: 'too_large' | 'invalid_form' };

/** Read the multipart envelope with a hard byte limit before parsing fields. */
export async function readTicketAttachmentForm(request: Request): Promise<TicketAttachmentFormResult> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_ATTACHMENT_MULTIPART_BYTES) {
    return { ok: false, reason: 'too_large' };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, reason: 'invalid_form' };
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ATTACHMENT_MULTIPART_BYTES) {
        await reader.cancel();
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'invalid_form' };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const boundedRequest = new Request(request.url, {
      method: 'POST',
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
      body: bytes,
    });
    return { ok: true, data: await boundedRequest.formData() };
  } catch {
    return { ok: false, reason: 'invalid_form' };
  }
}

export function buildTicketAttachmentPath(ticketId: string, token: string, mimeType: string): string {
  return `${ticketId}/${token}.${extensionForMime(mimeType)}`;
}
