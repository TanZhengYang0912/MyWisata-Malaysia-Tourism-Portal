import { describe, expect, it } from 'vitest';
import { abandonAndRemoveKycEvidence, buildKycEvidencePaths, createKycEvidenceRevision, hasDuplicateKycDocumentSides, validateKycUploadFile } from '../submission';

describe('KYC server submission helpers', () => {
  it('uses a stable, side-aware evidence revision for one or two document pages', () => {
    const front = 'a'.repeat(64);
    const back = 'b'.repeat(64);
    expect(createKycEvidenceRevision(front, null)).toMatch(/^[a-f0-9]{64}$/);
    expect(createKycEvidenceRevision(front, back)).not.toBe(createKycEvidenceRevision(front, null));
    expect(() => createKycEvidenceRevision('invalid', null)).toThrow('invalid_kyc_evidence_hash');
  });
  it('detects only equal, valid same-application front and back hashes', () => {
    const hash = 'a'.repeat(64);
    expect(hasDuplicateKycDocumentSides(hash, hash)).toBe(true);
    expect(hasDuplicateKycDocumentSides(hash, 'b'.repeat(64))).toBe(false);
    expect(hasDuplicateKycDocumentSides(null, null)).toBe(false);
    expect(hasDuplicateKycDocumentSides('invalid', 'invalid')).toBe(false);
  });
  it('binds both sides to one UUID token without exposing a client-selected path', () => {
    const paths = buildKycEvidencePaths(
      '2e2a8372-1c5f-4ba5-a645-f0a319c57b98',
      '1649a141-9c22-487d-97ae-d10c2b9f9007',
      '6bf054f5-61b2-4f5c-9180-4597555c5dc9',
      'image/jpeg',
      'image/png',
    );

    expect(paths).toEqual({
      front: '2e2a8372-1c5f-4ba5-a645-f0a319c57b98/1649a141-9c22-487d-97ae-d10c2b9f9007/6bf054f5-61b2-4f5c-9180-4597555c5dc9/front.jpg',
      back: '2e2a8372-1c5f-4ba5-a645-f0a319c57b98/1649a141-9c22-487d-97ae-d10c2b9f9007/6bf054f5-61b2-4f5c-9180-4597555c5dc9/back.png',
    });
  });

  it('rejects an allowed MIME type whose bytes do not match', async () => {
    const result = await validateKycUploadFile({
      type: 'image/png', size: 4, arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer,
    });

    expect(result).toEqual({ ok: false, code: 'INVALID_FILE_CONTENT' });
  });

  it('removes both deterministic paths only after the caller draft was abandoned', async () => {
    const removed: string[][] = [];
    const result = await abandonAndRemoveKycEvidence({
      submissionId: '1649a141-9c22-487d-97ae-d10c2b9f9007',
      paths: { front: 'front-path', back: 'back-path' },
      authenticated: { rpc: async () => ({ data: true, error: null }) },
      service: { storage: { from: () => ({ remove: async (paths: string[]) => { removed.push(paths); return { error: null }; } }) } },
    });

    expect(result).toEqual({ ok: true });
    expect(removed).toEqual([['front-path', 'back-path']]);
  });

  it('preserves evidence when the draft was not safely abandoned', async () => {
    let removed = false;
    const result = await abandonAndRemoveKycEvidence({
      submissionId: '1649a141-9c22-487d-97ae-d10c2b9f9007',
      paths: { front: 'front-path', back: 'back-path' },
      authenticated: { rpc: async () => ({ data: false, error: null }) },
      service: { storage: { from: () => ({ remove: async () => { removed = true; return { error: null }; } }) } },
    });

    expect(result).toEqual({ ok: false, reason: 'draft_not_abandoned' });
    expect(removed).toBe(false);
  });
});
