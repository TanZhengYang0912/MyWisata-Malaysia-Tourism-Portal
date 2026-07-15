import { validateMagicBytes } from '@/lib/kyc/magic-bytes';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_SIZE = 10 * 1024 * 1024;

type UploadFile = Pick<File, 'type' | 'size' | 'arrayBuffer'>;

export type ChatAttachmentValidation =
  | { ok: true; buffer: ArrayBuffer }
  | { ok: false; code: 'INVALID_FILE_TYPE' | 'FILE_TOO_LARGE' | 'INVALID_FILE_CONTENT' };

export async function validateChatAttachment(file: UploadFile): Promise<ChatAttachmentValidation> {
  if (!ACCEPTED_TYPES.has(file.type)) return { ok: false, code: 'INVALID_FILE_TYPE' };
  if (file.size > MAX_SIZE) return { ok: false, code: 'FILE_TOO_LARGE' };

  const buffer = await file.arrayBuffer();
  if (!await validateMagicBytes(buffer, file.type)) return { ok: false, code: 'INVALID_FILE_CONTENT' };
  return { ok: true, buffer };
}

function extensionForMime(mimeType: string): string {
  const byType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  return byType[mimeType] ?? 'bin';
}

export function buildChatAttachmentPath(threadId: string, token: string, mimeType: string): string {
  return `${threadId}/${token}.${extensionForMime(mimeType)}`;
}
