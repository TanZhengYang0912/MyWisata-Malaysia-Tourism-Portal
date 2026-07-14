import { validateMagicBytes } from './magic-bytes';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_SIZE = 5 * 1024 * 1024;

type UploadFile = Pick<File, 'type' | 'size' | 'arrayBuffer'>;

export type KycUploadValidation =
  | { ok: true; buffer: ArrayBuffer }
  | { ok: false; code: 'INVALID_FILE_TYPE' | 'FILE_TOO_LARGE' | 'INVALID_FILE_CONTENT' };

export async function validateKycUploadFile(file: UploadFile): Promise<KycUploadValidation> {
  if (!ACCEPTED_TYPES.has(file.type)) return { ok: false, code: 'INVALID_FILE_TYPE' };
  if (file.size > MAX_SIZE) return { ok: false, code: 'FILE_TOO_LARGE' };

  const buffer = await file.arrayBuffer();
  if (!await validateMagicBytes(buffer, file.type)) return { ok: false, code: 'INVALID_FILE_CONTENT' };
  return { ok: true, buffer };
}

function extensionForMime(mimeType: string): 'jpg' | 'png' | 'pdf' {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'application/pdf') return 'pdf';
  throw new Error('Unsupported KYC evidence MIME type');
}

export function buildKycEvidencePaths(
  userId: string,
  submissionId: string,
  token: string,
  frontMimeType: string,
  backMimeType: string,
): { front: string; back: string } {
  const prefix = `${userId}/${submissionId}/${token}`;
  return {
    front: `${prefix}/front.${extensionForMime(frontMimeType)}`,
    back: `${prefix}/back.${extensionForMime(backMimeType)}`,
  };
}
