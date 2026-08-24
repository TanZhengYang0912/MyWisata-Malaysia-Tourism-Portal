import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const createServiceClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

vi.mock('@/lib/supabase/service', () => ({ createServiceClient }));

const submissionId = '22222222-2222-4222-8222-222222222222';
const customerId = '11111111-1111-4111-8111-111111111111';
const routePath = resolve(process.cwd(), 'app/api/admin/kyc/submissions/[submissionId]/route.ts');

async function loadGet() {
  expect(existsSync(routePath), 'dedicated KYC detail API route must exist').toBe(true);
  if (!existsSync(routePath)) return null;
  return (await import('../route')).GET;
}

function serviceFor(options?: {
  roleName?: string;
  roleError?: Error | null;
  submission?: Record<string, unknown> | null;
  customer?: Record<string, unknown> | null;
}) {
  const roleQuery = {
    select: vi.fn(),
    eq: vi.fn().mockResolvedValue({
      data: [{ roles: { name: options?.roleName ?? 'approver' } }],
      error: options?.roleError ?? null,
    }),
  };
  roleQuery.select.mockReturnValue(roleQuery);

  const submissionQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options?.submission === null ? null : options?.submission ?? {
        id: submissionId,
        user_id: customerId,
        document_type: 'national_id',
        status: 'pending',
        queue_position: 2,
        created_at: '2026-07-15T08:00:00.000Z',
        reviewed_at: null,
        reviewer_id: null,
        review_reason_code: null,
        review_reason_detail: null,
        document_url: 'https://private.example/raw-document-value',
        ic_hash: 'sensitive-ic-hash',
        kyc_submission_documents: [{ side: 'front', storage_path: 'private/front.jpg' }],
        kyc_ocr_results: [{
          status: 'matched',
          holder_name: 'Customer Bob',
          document_number_last4: '6789',
          expiry_date: '2030-07-15',
          confidence: 0.98,
          mismatch_fields: [],
          processed_at: '2026-07-15T08:01:00.000Z',
          document_number_hmac: 'sensitive-hash',
          provider_model: 'private-provider-model',
        }],
      },
      error: null,
    }),
  };
  submissionQuery.select.mockReturnValue(submissionQuery);
  submissionQuery.eq.mockReturnValue(submissionQuery);

  const customerQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options?.customer === null ? null : options?.customer ?? {
        id: customerId,
        email: 'bob@example.com',
        full_name: 'Customer Bob',
      },
      error: null,
    }),
  };
  customerQuery.select.mockReturnValue(customerQuery);
  customerQuery.eq.mockReturnValue(customerQuery);

  const from = vi.fn((table: string) => {
    if (table === 'user_roles') return roleQuery;
    if (table === 'kyc_submissions') return submissionQuery;
    if (table === 'users') return customerQuery;
    throw new Error(`Unexpected table: ${table}`);
  });

  return { from, roleQuery, submissionQuery, customerQuery };
}

describe('GET /api/admin/kyc/submissions/[submissionId]', () => {
  beforeEach(() => {
    getUser.mockReset();
    createServiceClient.mockReset();
  });

  it('returns 401 before validating a malformed submission id', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const GET = await loadGet();
    if (!GET) return;

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ submissionId: 'not-a-uuid' }),
    });

    expect(response.status).toBe(401);
    expect(createServiceClient).not.toHaveBeenCalled();
  });

  it('returns 404 when the submission does not exist', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '33333333-3333-4333-8333-333333333333' } } });
    const service = serviceFor({ submission: null });
    createServiceClient.mockReturnValue(service);
    const GET = await loadGet();
    if (!GET) return;

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ submissionId }),
    });

    expect(response.status).toBe(404);
  });

  it('returns 403 for a customer role before loading submission detail', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '33333333-3333-4333-8333-333333333333' } } });
    const service = serviceFor({ roleName: 'customer' });
    createServiceClient.mockReturnValue(service);
    const GET = await loadGet();
    if (!GET) return;

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ submissionId }),
    });

    expect(response.status).toBe(403);
    expect(service.submissionQuery.select).not.toHaveBeenCalled();
  });

  it('returns 404 when the submission customer does not exist', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '33333333-3333-4333-8333-333333333333' } } });
    const service = serviceFor({ customer: null });
    createServiceClient.mockReturnValue(service);
    const GET = await loadGet();
    if (!GET) return;

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ submissionId }),
    });

    expect(response.status).toBe(404);
  });

  it('returns safe customer and submission detail without private storage data', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '33333333-3333-4333-8333-333333333333' } } });
    const service = serviceFor();
    createServiceClient.mockReturnValue(service);
    const GET = await loadGet();
    if (!GET) return;

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ submissionId }),
    });
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.data.customer).toEqual({
      id: customerId,
      name: 'Customer Bob',
      email: 'bob@example.com',
      avatarInitial: 'C',
    });
    expect(body.data.submission.documents).toEqual([{ side: 'front' }]);
    expect(serialized).not.toContain('storage_path');
    expect(serialized).not.toContain('private/front.jpg');
    expect(serialized).not.toContain('document_hash');
    expect(serialized).not.toContain('sensitive-hash');
    expect(serialized).not.toContain('ic_hash');
    expect(serialized).not.toContain('sensitive-ic-hash');
    expect(serialized).not.toContain('document_url');
    expect(serialized).not.toContain('raw-document-value');
    expect(serialized).not.toContain('document_number_hmac');
    expect(serialized).not.toContain('provider_model');
    expect(serialized).not.toContain('signedUrl');
  });

  it('keeps the shared select list free of private KYC columns', async () => {
    const { ADMIN_KYC_SUBMISSION_SELECT } = await import('@/lib/kyc/admin-submission');

    for (const privateColumn of [
      'storage_path',
      'ic_hash',
      'document_url',
      'document_number_hmac',
      'provider_model',
    ]) {
      expect(ADMIN_KYC_SUBMISSION_SELECT).not.toContain(privateColumn);
    }
  });
});
