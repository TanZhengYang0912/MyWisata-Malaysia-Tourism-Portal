import { describe, expect, it } from 'vitest';
import { compareKycDraftValues } from '../draft-client';

describe('compareKycDraftValues', () => {
  it('treats trimmed holder names and unchanged evidence as a no-op', () => {
    expect(compareKycDraftValues(
      { documentType: 'national_id', holderName: 'A Person ', frontChanged: false, backChanged: false },
      { documentType: 'national_id', holderName: 'A Person', frontChanged: false, backChanged: false },
    )).toEqual({ changed: false, metadataChanged: false, frontChanged: false, backChanged: false });
  });

  it('distinguishes a metadata-only edit from a one-sided evidence replacement', () => {
    expect(compareKycDraftValues(
      { documentType: 'passport', holderName: 'A Person', frontChanged: false, backChanged: false },
      { documentType: 'passport', holderName: 'B Person', frontChanged: false, backChanged: false },
    ).metadataChanged).toBe(true);
    expect(compareKycDraftValues(
      { documentType: 'passport', holderName: 'B Person', frontChanged: true, backChanged: false },
      { documentType: 'passport', holderName: 'B Person', frontChanged: false, backChanged: false },
    )).toMatchObject({ changed: true, frontChanged: true, backChanged: false });
  });
});
