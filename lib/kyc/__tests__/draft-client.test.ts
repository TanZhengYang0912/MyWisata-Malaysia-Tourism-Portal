import { describe, expect, it } from 'vitest';
import { compareKycDraftValues, compareKycOcrField } from '../draft-client';

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

describe('compareKycOcrField', () => {
  const myKadPreview = { status: 'extracted', holderName: 'A Person', documentNumber: '900101145678' };

  it('keeps equivalent entered MyKad values and their display formatting', () => {
    expect(compareKycOcrField('national_id', 'documentNumber', '900101-14-5678', myKadPreview))
      .toEqual({ status: 'matched', candidate: null });
  });

  it('offers a supported OCR value for a different entered value', () => {
    expect(compareKycOcrField('national_id', 'documentNumber', '900101-14-0000', myKadPreview))
      .toEqual({ status: 'different', candidate: '900101145678' });
  });

  it('offers a candidate for an empty field without treating unreadable unrelated fields as a block', () => {
    expect(compareKycOcrField('national_id', 'holderName', '', { ...myKadPreview, status: 'unreadable', documentNumber: null }))
      .toEqual({ status: 'empty', candidate: 'A Person' });
  });

  it('does not offer invalid document numbers as corrections', () => {
    expect(compareKycOcrField('national_id', 'documentNumber', 'bad', { ...myKadPreview, documentNumber: 'not-an-id' }))
      .toEqual({ status: 'unconfirmed', candidate: null });
  });

  it('requires a valid MRZ and a matching visible observation for Chinese passport fields', () => {
    const passportPreview = { status: 'extracted', holderName: 'LI WEI MING', documentNumber: 'EA1234567', mrzStatus: 'valid',
      visualComparisonStatus: 'incomplete', passportFieldEvidence: { holderName: 'matched', documentNumber: 'matched' } } as const;
    expect(compareKycOcrField('passport', 'holderName', 'LI WEI MING', passportPreview))
      .toEqual({ status: 'matched', candidate: null });
    expect(compareKycOcrField('passport', 'documentNumber', 'EA7654321', passportPreview))
      .toEqual({ status: 'different', candidate: 'EA1234567' });
    expect(compareKycOcrField('passport', 'documentNumber', '', { ...passportPreview, mrzStatus: 'invalid' }))
      .toEqual({ status: 'unconfirmed', candidate: null });
    expect(compareKycOcrField('passport', 'documentNumber', '', { ...passportPreview,
      passportFieldEvidence: { holderName: 'matched', documentNumber: 'missing' } }))
      .toEqual({ status: 'unconfirmed', candidate: null });
  });

  it('withholds every passport correction when the visible page conflicts with the MRZ', () => {
    const passportPreview = { status: 'extracted', holderName: 'LI WEI MING', documentNumber: 'EA1234567', mrzStatus: 'valid',
      visualComparisonStatus: 'conflict', passportFieldEvidence: { holderName: 'matched', documentNumber: 'matched' } } as const;
    expect(compareKycOcrField('passport', 'holderName', 'OTHER NAME', passportPreview))
      .toEqual({ status: 'document_conflict', candidate: null });
  });
});
