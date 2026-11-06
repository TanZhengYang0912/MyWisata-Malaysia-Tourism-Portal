import { beforeEach, describe, expect, it, vi } from 'vitest';

const getClaims = vi.fn(async () => ({ data: { claims: { sub: '22222222-2222-4222-8222-222222222222', aal: 'aal2', session_id: '77777777-7777-4777-8777-777777777777' } }, error: null }));
const getUser = vi.fn();
const rpc = vi.fn();
const serviceRpc = vi.fn();
const requireStaffPermission = vi.fn();

const db = { auth: { getUser, getClaims }, rpc };

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => db,
}));
vi.mock('@/lib/staff-permissions/server', () => ({ requireStaffPermission }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ rpc: serviceRpc }) }));

const { POST } = await import('../route');

const userId = '11111111-1111-4111-8111-111111111111';

describe('POST /api/admin/kyc/review', () => {
  beforeEach(() => {
    getUser.mockReset();
    rpc.mockReset();
    serviceRpc.mockReset();
    requireStaffPermission.mockReset();
    rpc.mockImplementation(async (name: string) => name === 'issue_kyc_service_operation_ticket'
      ? { data: { ticketId: '88888888-8888-4888-8888-888888888888', reviewVersion: 7, evidenceRevision: 'evidence-v1' }, error: null }
      : { data: null, error: null });
    serviceRpc.mockResolvedValue({
      data: { primaryConfirmationId: '44444444-4444-4444-8444-444444444444', secondaryConfirmationId: '55555555-5555-4555-8555-555555555555' }, error: null,
    });
    requireStaffPermission.mockResolvedValue({ db, user: { id: '22222222-2222-4222-8222-222222222222' }, response: null });
  });

  it('denies AAL1 before validating or deciding submissions', async () => {
    getClaims.mockResolvedValueOnce({ data: { claims: { sub: '22222222-2222-4222-8222-222222222222', aal: 'aal1', session_id: '77777777-7777-4777-8777-777777777777' } }, error: null });
    const response = await POST(new Request('http://localhost', { method: 'POST' }));
    expect(response.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sends structured catalog reasons to the hardened RPC', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '22222222-2222-4222-8222-222222222222' } } });
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        submissionId: '33333333-3333-4333-8333-333333333333',
        userId,
        expectedVersion: 7,
        action: 'reject',
        reasonCode: 'other',
        reasonDetail: '  The document image has an obscured security feature.  ',
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { userId, kycStatus: 'rejected', action: 'reject' },
    });
    expect(rpc).toHaveBeenCalledWith('review_kyc_case_v2', {
      p_submission_id: '33333333-3333-4333-8333-333333333333',
      p_user_id: userId,
      p_expected_version: 7,
      p_action: 'reject',
      p_reason_code: 'other',
      p_reason_detail: 'The document image has an obscured security feature.',
      p_operation_id: expect.any(String),
      p_primary_confirmation_id: null,
      p_secondary_confirmation_id: null,
    });
  });

  it('rejects unknown reason codes before calling the RPC', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '22222222-2222-4222-8222-222222222222' } } });

    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ submissionId: '33333333-3333-4333-8333-333333333333', userId, expectedVersion: 7, action: 'reject', reasonCode: 'unknown' }),
    }));

    expect(response.status).toBe(422);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('requires admin.kyc.review before parsing the body or deciding', async () => {
    requireStaffPermission.mockResolvedValue({
      db,
      user: { id: '22222222-2222-4222-8222-222222222222' },
      response: Response.json({ data: null, error: { code: 'FORBIDDEN' } }, { status: 403 }),
    });

    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: '{invalid-json',
    }));

    expect(response.status).toBe(403);
    expect(requireStaffPermission).toHaveBeenCalledWith('admin.kyc.review');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns a conflict when a reviewer tries to decide another reviewer assignment', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '22222222-2222-4222-8222-222222222222' } } });
    rpc.mockImplementation(async (name: string) => name === 'issue_kyc_service_operation_ticket'
      ? { data: { ticketId: '88888888-8888-4888-8888-888888888888', reviewVersion: 7, evidenceRevision: 'evidence-v1' }, error: null }
      : { data: null, error: { message: 'kyc_not_assigned' } });

    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        submissionId: '33333333-3333-4333-8333-333333333333',
        userId,
        expectedVersion: 7,
        action: 'approve', operationId: '66666666-6666-4666-8666-666666666666',
      }),
    }));

    expect(response.status).toBe(409);
  });

  it.each([
    ['kyc_permission_required', 403, 'FORBIDDEN'],
    ['kyc_assignment_changed', 409, 'CONFLICT'],
    ['self_dealing', 403, 'SELF_DEALING'],
    ['invalid_reason_code', 422, 'VALIDATION_FAILED'],
    ['reason_detail_too_short', 422, 'VALIDATION_FAILED'],
  ])('maps the known database error %s without exposing raw details', async (databaseError, status, code) => {
    rpc.mockImplementation(async (name: string) => name === 'issue_kyc_service_operation_ticket'
      ? { data: { ticketId: '88888888-8888-4888-8888-888888888888', reviewVersion: 7, evidenceRevision: 'evidence-v1' }, error: null }
      : { data: null, error: { message: `${databaseError}: internal relation detail` } });

    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        submissionId: '33333333-3333-4333-8333-333333333333',
        userId,
        expectedVersion: 7,
        action: 'approve', operationId: '66666666-6666-4666-8666-666666666666',
      }),
    }));

    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.error.code).toBe(code);
    expect(JSON.stringify(body)).not.toContain('internal relation detail');
  });

  it('returns a generic safe 500 for unknown database errors', async () => {
    rpc.mockImplementation(async (name: string) => name === 'issue_kyc_service_operation_ticket'
      ? { data: { ticketId: '88888888-8888-4888-8888-888888888888', reviewVersion: 7, evidenceRevision: 'evidence-v1' }, error: null }
      : { data: null, error: { message: 'sensitive_table secret diagnostic' } });

    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        submissionId: '33333333-3333-4333-8333-333333333333',
        userId,
        expectedVersion: 7,
        action: 'approve', operationId: '66666666-6666-4666-8666-666666666666',
      }),
    }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({
      data: null,
      error: { code: 'RPC_ERROR', message: 'KYC review could not be completed' },
    });
    expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.headers.get('x-request-id')).toBe(body.error.requestId);
    expect(JSON.stringify(body)).not.toContain('sensitive_table secret diagnostic');
  });

  it('returns the independent KYC outcome without a synthetic tier', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '22222222-2222-4222-8222-222222222222' } } });

    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        submissionId: '33333333-3333-4333-8333-333333333333',
        userId,
        expectedVersion: 7,
        action: 'approve', operationId: '66666666-6666-4666-8666-666666666666',
      }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ data: { userId, kycStatus: 'approved', action: 'approve' } });
    expect(body.data).not.toHaveProperty('tier');
    expect(serviceRpc).toHaveBeenCalledWith('get_kyc_review_confirmation_ids_v2', expect.objectContaining({
      p_ticket_id: '88888888-8888-4888-8888-888888888888',
      p_submission_id: '33333333-3333-4333-8333-333333333333',
      p_expected_version: 7,
      p_evidence_revision: 'evidence-v1',
      p_primary_actor_id: '22222222-2222-4222-8222-222222222222',
      p_primary_session_id: '77777777-7777-4777-8777-777777777777',
    }));
    expect(JSON.stringify(body)).not.toContain('44444444-4444-4444-8444-444444444444');
  });

  it('rejects browser-supplied confirmation IDs', async () => {
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ submissionId: '33333333-3333-4333-8333-333333333333', userId, expectedVersion: 7, action: 'approve', operationId: '66666666-6666-4666-8666-666666666666', primaryConfirmationId: '44444444-4444-4444-8444-444444444444' }),
    }));
    expect(response.status).toBe(422);
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('blocks approval until a current independent confirmation exists', async () => {
    serviceRpc.mockReset();
    serviceRpc.mockResolvedValueOnce({
      data: { primaryConfirmationId: '44444444-4444-4444-8444-444444444444', secondaryConfirmationId: null }, error: null,
    });
    const response = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ submissionId: '33333333-3333-4333-8333-333333333333', userId, expectedVersion: 7, action: 'approve', operationId: '66666666-6666-4666-8666-666666666666' }),
    }));
    expect(response.status).toBe(422);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalledWith('review_kyc_case_v2', expect.anything());
  });
});
