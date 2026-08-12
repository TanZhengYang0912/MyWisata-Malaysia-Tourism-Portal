import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  isSuperAdmin: vi.fn(),
  reviewRecommendation: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: mocks.createServiceClient,
}));
vi.mock('@/lib/affiliate/admin-guard', () => ({
  isSuperAdmin: mocks.isSuperAdmin,
}));
vi.mock('@/lib/admin-ai/moderation', () => ({
  reviewRecommendation: mocks.reviewRecommendation,
}));

import { POST } from '../route';

const recommendationId = '3bd3f3ef-8e4c-4bbc-b7f5-be5d9f9ae9fe';
const validAssessment = {
  suggestedAction: 'approve',
  confidence: 'high',
  evidenceChecks: [],
  findings: [],
  duplicateCount: 0,
  duplicateBasis: 'exact_normalized_name',
  feedbackDraft: null,
  photoAssessments: [],
  aiAvailable: true,
};

function validRequest() {
  return new Request('http://localhost/api/admin-ai/moderation-review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ recommendationId }),
  });
}

describe('POST /api/admin-ai/moderation-review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockReset();
    mocks.isSuperAdmin.mockReset();
    mocks.reviewRecommendation.mockReset();
    mocks.createServiceClient.mockReset();
  });

  it('does not create a service client for an unauthenticated request', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(validRequest());

    expect(response.status).toBe(401);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('does not create a service client for a non-Super-Admin request', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(false);

    const response = await POST(validRequest());

    expect(response.status).toBe(403);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it('creates service access only after Super Admin authorization', async () => {
    const service = { marker: 'service' };
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.isSuperAdmin.mockImplementation(async () => {
      expect(mocks.createServiceClient).not.toHaveBeenCalled();
      return true;
    });
    mocks.createServiceClient.mockReturnValue(service);
    mocks.reviewRecommendation.mockResolvedValue(validAssessment);

    const response = await POST(validRequest());

    expect(response.status).toBe(200);
    expect(mocks.reviewRecommendation).toHaveBeenCalledWith(service, recommendationId);
  });

  it('returns the deterministic assessment when Gemini is unavailable', async () => {
    const service = { marker: 'service' };
    const degradedAssessment = {
      ...validAssessment,
      suggestedAction: null,
      confidence: null,
      aiAvailable: false,
      evidenceChecks: [{
        field: 'description',
        label: 'Description',
        status: 'passed',
        message: 'Description is present.',
      }],
    };
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mocks.isSuperAdmin.mockResolvedValue(true);
    mocks.createServiceClient.mockReturnValue(service);
    mocks.reviewRecommendation.mockResolvedValue(degradedAssessment);

    const response = await POST(validRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ data: degradedAssessment, error: null });
    expect(body.data.aiAvailable).toBe(false);
    expect(JSON.stringify(body)).not.toContain('Gemini API key');
  });
});
