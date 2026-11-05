import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ gate: vi.fn(), rpc: vi.fn(), service: vi.fn() }));
vi.mock('@/lib/kyc/reviewer-auth', () => ({ requireKycReviewer: mocks.gate }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.service }));
import { GET, POST } from '../route';
beforeEach(() => {
  mocks.gate.mockResolvedValue({ user: { id: '11111111-1111-4111-8111-111111111111' }, db: { rpc: mocks.rpc }, response: null });
  mocks.rpc.mockReset().mockResolvedValue({ data: { submissionId: null }, error: null });
});
const request = (body: unknown) => new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
describe('KYC case navigation', () => {
  it('checks reviewer before parsing or accessing assignments', async () => {
    mocks.gate.mockResolvedValue({ response: new Response(null, { status: 403 }) });
    expect((await POST(request({ action: 'next' }))).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('uses only the authenticated database actor for atomic next-case', async () => {
    const response = await POST(request({ action: 'next' }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('manage_kyc_review_work', { p_action: 'next', p_submission_id: null, p_expected_version: null, p_session_id: null });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it.each([{ action: 'release' }, { action: 'next', actorId: 'forged' }, { action: 'approve' }])('rejects invalid assignment input %j', async (body) => {
    expect((await POST(request(body))).status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not leak diagnostics on claim conflict', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'private path secret' } });
    const response = await POST(request({ action: 'next' }));
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain('secret');
  });
});

const actor = '11111111-1111-4111-8111-111111111111';
const row = { id: '22222222-2222-4222-8222-222222222222', user_id: '33333333-3333-4333-8333-333333333333',
  document_type: 'national_id', created_at: '2026-10-29T08:00:00Z', assigned_to: actor,
  legal_name_snapshot: 'Customer Alice', document_number: 'private-number', front_path: 'private/path' };
function candidateReads(results: Array<{ data: unknown; error: unknown }>) {
  const reads: Array<{ table: string; calls: Array<[string, ...unknown[]]> }> = [];
  mocks.service.mockReturnValue({ from: (table: string) => {
    const read = { table, calls: [] as Array<[string, ...unknown[]]> }; reads.push(read);
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const method of ['select', 'eq', 'neq', 'is', 'order', 'limit']) {
      chain[method] = vi.fn((...args: unknown[]) => { read.calls.push([method, ...args]); return chain; });
    }
    chain.maybeSingle = vi.fn(async () => results.shift() ?? { data: null, error: null });
    return chain;
  } });
  return reads;
}

describe('read-only named KYC candidate', () => {
  beforeEach(() => { mocks.service.mockReset(); });
  it('requires the reviewer/MFA gate before privileged reads', async () => {
    mocks.gate.mockResolvedValue({ response: new Response(null, { status: 403 }) });
    expect((await GET()).status).toBe(403);
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it('prefers the actor own pending case and returns only display fields', async () => {
    const reads = candidateReads([{ data: row, error: null }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).data.candidate).toEqual({ submissionId: row.id, name: row.legal_name_snapshot,
      docType: row.document_type, submittedAt: row.created_at, isAssignedToCurrentUser: true });
    expect(reads).toHaveLength(1);
    expect(reads[0].calls).toEqual(expect.arrayContaining([
      ['eq', 'status', 'pending'], ['eq', 'assigned_to', actor], ['neq', 'user_id', actor],
      ['order', 'created_at', { ascending: true }], ['order', 'id', { ascending: true }], ['limit', 1],
    ]));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('falls back to one unassigned pending case, never another reviewer case', async () => {
    const reads = candidateReads([{ data: null, error: null }, { data: { ...row, assigned_to: null }, error: null }]);
    const response = await GET();
    expect((await response.json()).data.candidate.isAssignedToCurrentUser).toBe(false);
    expect(reads).toHaveLength(2);
    expect(reads[1].calls).toEqual(expect.arrayContaining([['is', 'assigned_to', null], ['eq', 'status', 'pending'], ['neq', 'user_id', actor], ['limit', 1]]));
  });
  it('returns null when no eligible pending case exists', async () => {
    candidateReads([{ data: null, error: null }, { data: null, error: null }]);
    expect((await (await GET()).json()).data).toEqual({ candidate: null });
  });
  it('uses one keyed name fallback without adding contact details to the DTO', async () => {
    const reads = candidateReads([{ data: { ...row, legal_name_snapshot: null }, error: null }, { data: { full_name: 'Alice profile' }, error: null }]);
    const response = await GET(); const body = await response.json();
    expect(body.data.candidate.name).toBe('Alice profile');
    expect(reads[1]).toEqual({ table: 'users', calls: [['select', 'full_name'], ['eq', 'id', row.user_id]] });
    for (const field of ['user_id', 'email', 'phone', 'private-number', 'private/path', 'assigned_to']) expect(JSON.stringify(body)).not.toContain(field);
  });
  it('fails closed on database errors instead of reporting an empty queue', async () => {
    const reads = candidateReads([{ data: null, error: { message: 'private/path secret' } }]);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret');
    expect(reads).toHaveLength(1);
  });
});
