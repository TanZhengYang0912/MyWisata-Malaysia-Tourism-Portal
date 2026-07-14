import { describe, expect, it } from 'vitest';
import { validateReviewReason } from '../review-reasons';
import type { KycReviewReasonCode } from '../types';

describe('validateReviewReason', () => {
  it('requires a detail of at least ten characters for other', () => {
    expect(validateReviewReason('reject', 'other', 'too short')).toEqual({
      ok: false,
      error: 'reason_detail_too_short',
    });
  });

  it('does not permit suspected tampering as an information request', () => {
    expect(validateReviewReason('request_info', 'document_suspected_tampering', null)).toEqual({
      ok: false,
      error: 'reason_code_not_allowed',
    });
  });

  it('accepts a standard rejection reason without detail', () => {
    expect(validateReviewReason('reject', 'document_unreadable', null)).toEqual({ ok: true });
  });

  it('does not permit a detail for a standard reason code', () => {
    expect(validateReviewReason('reject', 'document_unreadable', 'This must not be accepted.')).toEqual({
      ok: false,
      error: 'reason_detail_not_allowed',
    });
  });

  it.each([
    'document_unreadable',
    'document_incomplete',
    'document_mismatch',
    'document_expired',
    'document_suspected_tampering',
    'other',
  ] as const)('accepts every catalog reason code for rejection', (reasonCode) => {
    expect(validateReviewReason('reject', reasonCode, reasonCode === 'other' ? 'A sufficiently detailed explanation.' : null))
      .toEqual({ ok: true });
  });

  it('trims detail before enforcing the other reason minimum', () => {
    expect(validateReviewReason('reject', 'other', '  123456789  ')).toEqual({
      ok: false,
      error: 'reason_detail_too_short',
    });
  });

  it('does not permit an unapproved rejection reason', () => {
    expect(validateReviewReason('reject', 'unapproved' as KycReviewReasonCode, null)).toEqual({
      ok: false,
      error: 'reason_code_not_allowed',
    });
  });
});
