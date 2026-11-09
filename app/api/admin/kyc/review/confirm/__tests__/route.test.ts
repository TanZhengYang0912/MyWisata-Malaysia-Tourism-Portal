import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ reviewer: vi.fn(), service: vi.fn(), ticket: vi.fn(), hash: vi.fn() }));
vi.mock('@/lib/kyc/reviewer-auth', () => ({ requireKycReviewer: mocks.reviewer }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.service }));
vi.mock('@/lib/kyc/service-operation-ticket', () => ({ issueKycServiceOperationTicket: mocks.ticket }));
vi.mock('@/lib/kyc/hash', async (original) => ({ ...await original<typeof import('@/lib/kyc/hash')>(), hashICWithHmac: mocks.hash }));
import { POST } from '../route';

const id = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const passport = {
  mrzLine1: 'P<CHNLI<<WEI<MING'.padEnd(44, '<'), mrzLine2: 'EA12345676CHN9001011M3001019<<<<<<<<<<<<<<04',
  nationality: 'CN', birthDate: '1990-01-01', expiryDate: '2030-01-01', sex: 'M',
};
const payload = { submissionId: id, expectedVersion: 7, documentAccessRefs: [id], actualDocumentType: 'passport',
  issuerCountry: 'CN', identifierKind: 'passport', holderName: 'LI WEI MING', documentNumber: 'EA1234567', reasonCode: 'ocr_unreadable' };

describe('manual passport confirmation', () => {
  const db = { rpc: vi.fn(), auth: { getClaims: vi.fn() } };
  const service = { rpc: vi.fn(), from: vi.fn() };
  const single = vi.fn();
  const request = (value: unknown) => new Request('http://localhost/api/admin/kyc/review/confirm', { method: 'POST', body: JSON.stringify(value) });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('KYC_REVIEW_CONFIRMATION_TTL_SECONDS', '300');
    mocks.reviewer.mockResolvedValue({ db, user: { id: 'reviewer' }, response: null });
    mocks.service.mockReturnValue(service);
    mocks.ticket.mockResolvedValue({ ticketId: id, evidenceRevision: 'current-evidence' });
    mocks.hash.mockResolvedValue({ value: 'a'.repeat(64) });
    db.auth.getClaims.mockResolvedValue({ data: { claims: { session_id: sessionId } }, error: null });
    service.from.mockReturnValue({ select: () => ({ eq: () => ({ maybeSingle: single }) }) });
    single.mockResolvedValue({ data: { user_id: 'owner', document_type: 'passport', review_version: 7 }, error: null });
    service.rpc.mockResolvedValue({ data: id, error: null });
    db.rpc.mockResolvedValue({ error: null });
  });

  it('rejects incomplete passport proof instead of staging a generic override', async () => {
    expect((await POST(request(payload))).status).toBe(422);
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it('stages only server-recomputed safe facts bound to ticket, revision, session and independent purpose', async () => {
    const response = await POST(request({ ...payload, purpose: 'independent_second', passport }));
    expect(response.status).toBe(200);
    expect(service.rpc).toHaveBeenCalledWith('stage_kyc_manual_passport_confirmation_with_ticket', expect.objectContaining({
      p_ticket_id: id, p_expected_session_id: sessionId, p_evidence_revision: 'current-evidence', p_purpose: 'independent_second',
      p_passport_nationality: 'CN', p_passport_expiry_date: '2030-01-01',
    }));
    const serialized = JSON.stringify(service.rpc.mock.calls);
    expect(serialized).not.toContain(passport.mrzLine2);
    expect(serialized).not.toContain(passport.birthDate);
    expect(serialized).not.toContain(payload.documentNumber);
    expect(db.rpc).toHaveBeenCalledWith('attest_kyc_identity_confirmation', { p_confirmation_id: id });
  });

  it.each([
    { ...passport, mrzLine2: passport.mrzLine2.slice(0, -1) + '5' },
    { ...passport, expiryDate: '2031-01-01' },
    { ...passport, birthDate: '1991-01-01' },
    { ...passport, nationality: 'MY' },
  ])('rejects invalid or inconsistent proof', async (proof) => {
    expect((await POST(request({ ...payload, passport: proof }))).status).toBe(422);
    expect(service.rpc).not.toHaveBeenCalled();
  });

  it('honors reviewer authorization and fails before reading protected data', async () => {
    mocks.reviewer.mockResolvedValue({ response: new Response(null, { status: 403 }) });
    expect((await POST(request({ ...payload, passport }))).status).toBe(403);
    expect(mocks.service).not.toHaveBeenCalled();
  });

  it('rejects self review and stale cases', async () => {
    single.mockResolvedValue({ data: { user_id: 'reviewer', document_type: 'passport', review_version: 7 } });
    expect((await POST(request({ ...payload, passport }))).status).toBe(403);
    single.mockResolvedValue({ data: { user_id: 'owner', document_type: 'passport', review_version: 8 } });
    expect((await POST(request({ ...payload, passport }))).status).toBe(409);
    expect(service.rpc).not.toHaveBeenCalled();
  });
});
