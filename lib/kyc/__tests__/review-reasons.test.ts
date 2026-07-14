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

  it('does not permit an unapproved rejection reason', () => {
    expect(validateReviewReason('reject', 'unapproved' as KycReviewReasonCode, null)).toEqual({
      ok: false,
      error: 'reason_code_not_allowed',
    });
  });
});
