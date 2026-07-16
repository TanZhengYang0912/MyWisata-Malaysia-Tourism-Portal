import { validateMagicBytes } from './magic-bytes';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
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

function extensionForMime(mimeType: string): 'jpg' | 'png' | 'webp' {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
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

type RpcResult = { data: boolean | null; error: unknown | null };
type RemoveResult = { error: unknown | null };

export async function abandonAndRemoveKycEvidence({
  submissionId,
  paths,
  authenticated,
  service,
}: {
  submissionId: string;
  paths: { front: string; back: string };
  authenticated: { rpc: (name: 'abandon_kyc_submission', args: { p_submission_id: string }) => PromiseLike<RpcResult> };
  service: { storage: { from: (bucket: 'kyc-documents') => { remove: (paths: string[]) => Promise<RemoveResult> } } };
}): Promise<{ ok: true } | { ok: false; reason: 'draft_not_abandoned' | 'object_removal_failed' }> {
  const abandoned = await authenticated.rpc('abandon_kyc_submission', { p_submission_id: submissionId });
  if (abandoned.error || abandoned.data !== true) return { ok: false, reason: 'draft_not_abandoned' };

  const removed = await service.storage.from('kyc-documents').remove([paths.front, paths.back]);
  if (removed.error) return { ok: false, reason: 'object_removal_failed' };
  return { ok: true };
}
