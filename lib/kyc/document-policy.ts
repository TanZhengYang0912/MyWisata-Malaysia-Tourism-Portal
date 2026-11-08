import type { KycDocumentSide } from './types';

export type KycDocumentType = 'national_id' | 'passport' | 'driving_license';

export function getRequiredKycDocumentSides(documentType: KycDocumentType): readonly KycDocumentSide[] {
  return documentType === 'passport' ? ['front'] : ['front', 'back'];
}

export function isSupportedDocumentNumber(documentType: KycDocumentType, value: string): boolean {
  const normalized = value.trim().toUpperCase();
  if (documentType === 'passport') {
    return /^G[0-9]{8}$/.test(normalized)
      || /^E[A-HJ-NP-Z][0-9]{7}$/.test(normalized);
  }
  return /^\d{6}-?\d{2}-?\d{4}$/.test(normalized);
}

export function hasRequiredKycEvidence(documentType: KycDocumentType, front: unknown, back: unknown): boolean {
  const isImage = (value: unknown) => !!value && typeof value === 'object' && 'bytes' in value
    && value.bytes instanceof Uint8Array && value.bytes.length > 0 && 'mimeType' in value
    && ['image/jpeg', 'image/png', 'image/webp'].includes(String(value.mimeType));
  return isImage(front) && (documentType === 'passport' || isImage(back));
}
