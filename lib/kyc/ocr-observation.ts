import { createHash } from 'node:crypto';
import { getRequiredKycDocumentSides, type KycDocumentType } from './document-policy';

const SHA256 = /^[a-f0-9]{64}$/;
const TOKEN = /^[a-zA-Z0-9._-]{1,64}$/;

export type KycOcrSourceInput = {
  documentType: KycDocumentType;
  cleanTransformVersion: string;
  frontInputSha256: string;
  frontCleanSha256: string;
  backInputSha256: string | null;
  backCleanSha256: string | null;
};

export type KycOcrObservationBinding = {
  ownerId: string;
  draftId: string;
  sourceRevision: string;
  artifactRevision: string;
  engine: string;
  parserVersion: string;
  policyVersion: string;
};

export function buildKycOcrSourceRevision(input: KycOcrSourceInput): string {
  const requiredSides = getRequiredKycDocumentSides(input.documentType);
  if (!TOKEN.test(input.cleanTransformVersion) || !SHA256.test(input.frontInputSha256) || !SHA256.test(input.frontCleanSha256)) {
    throw new Error('invalid_kyc_ocr_source');
  }
  if (requiredSides.includes('back')) {
    if (!input.backInputSha256 || !input.backCleanSha256 || !SHA256.test(input.backInputSha256) || !SHA256.test(input.backCleanSha256)) {
      throw new Error('invalid_kyc_ocr_source');
    }
  } else if (input.backInputSha256 !== null || input.backCleanSha256 !== null) {
    throw new Error('invalid_kyc_ocr_source');
  }
  const fields = [
    'kyc-source-v1', input.documentType, input.cleanTransformVersion, 'front', input.frontInputSha256, input.frontCleanSha256,
    requiredSides.includes('back') ? 'back' : 'none', input.backInputSha256 ?? '', input.backCleanSha256 ?? '',
  ];
  return createHash('sha256').update(fields.join('|'), 'utf8').digest('hex');
}

export function canReuseKycOcrObservation(expected: KycOcrObservationBinding, existing: KycOcrObservationBinding): boolean {
  return expected.ownerId === existing.ownerId
    && expected.draftId === existing.draftId
    && expected.sourceRevision === existing.sourceRevision
    && expected.artifactRevision === existing.artifactRevision
    && expected.engine === existing.engine
    && expected.parserVersion === existing.parserVersion
    && expected.policyVersion === existing.policyVersion;
}
