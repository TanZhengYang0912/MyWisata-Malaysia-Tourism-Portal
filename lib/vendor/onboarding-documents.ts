import { validateMagicBytes } from '@/lib/kyc/magic-bytes';

const ACCEPTED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE = 10 * 1024 * 1024;

export async function validateVendorDocument(file: Pick<File, 'type' | 'size' | 'arrayBuffer'>) {
  if (!ACCEPTED_TYPES.has(file.type)) return { ok: false as const, code: 'INVALID_FILE_TYPE' };
  if (file.size <= 0 || file.size > MAX_SIZE) return { ok: false as const, code: 'FILE_TOO_LARGE' };
  const buffer = await file.arrayBuffer();
  if (!(await validateMagicBytes(buffer, file.type))) return { ok: false as const, code: 'INVALID_FILE_CONTENT' };
  return { ok: true as const, buffer };
}

export function safeDocumentName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'document';
}
