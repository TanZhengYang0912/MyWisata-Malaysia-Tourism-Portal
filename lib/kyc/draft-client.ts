export type KycDraftEditableValues = {
  documentType: 'national_id' | 'passport' | 'driving_license';
  holderName: string;
  frontChanged: boolean;
  backChanged: boolean;
};

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
