import { isSupportedDocumentNumber, type KycDocumentType } from './document-policy';
import { normalizeIC } from './hash';

export type KycDraftEditableValues = {
  documentType: 'national_id' | 'passport' | 'driving_license';
  holderName: string;
  frontChanged: boolean;
  backChanged: boolean;
};

export type KycOcrField = 'holderName' | 'documentNumber';
export type KycOcrPreviewValues = {
  status: string;
  holderName: string | null;
  documentNumber: string | null;
  mrzStatus?: string;
  visualComparisonStatus?: string;
  passportFieldEvidence?: {
    holderName?: 'matched' | 'missing' | 'conflict';
    documentNumber?: 'matched' | 'missing' | 'conflict';
  };
};
export type KycOcrFieldComparison = { status: 'matched' | 'different' | 'empty' | 'unconfirmed' | 'document_conflict'; candidate: string | null };

export type KycDraftComparison = {
  changed: boolean;
  metadataChanged: boolean;
  frontChanged: boolean;
  backChanged: boolean;
};

export function compareKycDraftValues(
  current: KycDraftEditableValues,
  saved: KycDraftEditableValues,
): KycDraftComparison {
  const metadataChanged = current.documentType !== saved.documentType
    || current.holderName.trim() !== saved.holderName.trim();
  return {
    changed: metadataChanged || current.frontChanged || current.backChanged,
    metadataChanged,
    frontChanged: current.frontChanged,
    backChanged: current.backChanged,
  };
}

function normalizePassportName(value: string): string {
  return value.normalize('NFKC').toUpperCase().replace(/[’']/g, '').replace(/[,<\-]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function compareKycOcrField(
  documentType: KycDocumentType,
  field: KycOcrField,
  enteredValue: string,
  preview: KycOcrPreviewValues,
): KycOcrFieldComparison {
  const candidate = (field === 'holderName' ? preview.holderName : preview.documentNumber)?.trim() ?? '';
  if (candidate.length < 2 || candidate.length > 100) return { status: 'unconfirmed', candidate: null };

  if (field === 'documentNumber' && !isSupportedDocumentNumber(documentType, candidate)) {
    return { status: 'unconfirmed', candidate: null };
  }

  if (documentType === 'passport') {
    if (preview.visualComparisonStatus === 'conflict') return { status: 'document_conflict', candidate: null };
    const evidence = preview.passportFieldEvidence?.[field];
    if (preview.mrzStatus !== 'valid' || !['consistent', 'incomplete'].includes(preview.visualComparisonStatus ?? '') || evidence !== 'matched') {
      return { status: 'unconfirmed', candidate: null };
    }
  } else if (preview.status !== 'extracted' && field === 'documentNumber') {
    return { status: 'unconfirmed', candidate: null };
  }

  const entered = enteredValue.trim();
  if (!entered) return { status: 'empty', candidate };
  const matches = field === 'documentNumber'
    ? isSupportedDocumentNumber(documentType, entered) && normalizeIC(entered) === normalizeIC(candidate)
    : (documentType === 'passport' ? normalizePassportName(entered) : entered.normalize('NFKC').replace(/\s+/g, ' ').toUpperCase())
      === (documentType === 'passport' ? normalizePassportName(candidate) : candidate.normalize('NFKC').replace(/\s+/g, ' ').toUpperCase());
  return matches ? { status: 'matched', candidate: null } : { status: 'different', candidate };
}
