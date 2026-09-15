import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ callGemini: vi.fn(), createServiceClient: vi.fn() }));
vi.mock('@/lib/admin-ai/gemini', () => ({ callGemini: mocks.callGemini }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));

const { draftCopilotCaption } = await import('../copilot');

function mockProduct(product: { id: string; name: string; description: string | null; base_price: number | null } | null, metric: { rating: number; reviews: number } | null = null) {
  mocks.createServiceClient.mockReturnValue({
    from: (table: string) => {
      if (table === 'products') {
        return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: product }) }) }) }) }) };
      }
      if (table === 'product_review_metrics') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: metric }) }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  });
}

describe('draftCopilotCaption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for a listing that is not real/active right now', async () => {
    mockProduct(null);

    const result = await draftCopilotCaption('does-not-exist', 'en');

    expect(result).toBeNull();
    expect(mocks.callGemini).not.toHaveBeenCalled();
  });

  it('drafts an LLM caption grounded in the real fetched facts', async () => {
    mockProduct({ id: 'p1', name: 'White Coffee', description: 'Traditional Ipoh-style white coffee.', base_price: 8.5 }, { rating: 4.8, reviews: 12 });
    mocks.callGemini.mockResolvedValue('Try the famous White Coffee — smooth, rich, and only RM8.50!');

    const result = await draftCopilotCaption('p1', 'en');

    expect(result).toEqual({ caption: 'Try the famous White Coffee — smooth, rich, and only RM8.50!', mode: 'llm' });
    // The facts payload handed to Gemini must be exactly what was fetched — no re-derivation, no extra invented fields.
    const [, userText] = mocks.callGemini.mock.calls[0];
    expect(JSON.parse(userText)).toEqual({
      productId: 'p1', productName: 'White Coffee', description: 'Traditional Ipoh-style white coffee.', basePriceRM: 8.5, rating: 4.8, reviewCount: 12,
    });
  });

  it('passes the target language into the system prompt', async () => {
    mockProduct({ id: 'p1', name: 'White Coffee', description: null, base_price: null });
    mocks.callGemini.mockResolvedValue('白咖啡，值得一试！');

    await draftCopilotCaption('p1', 'zh');

    expect(mocks.callGemini).toHaveBeenCalledWith(expect.stringContaining('Simplified Chinese'), expect.any(String), expect.any(Object));
  });

  it('falls back to a rule-based caption using only real facts when Gemini fails', async () => {
    mockProduct({ id: 'p1', name: 'Mutton Briyani', description: null, base_price: 15 }, { rating: 4.5, reviews: 8 });
    mocks.callGemini.mockRejectedValue(new Error('Gemini generateContent failed: 503'));

    const result = await draftCopilotCaption('p1', 'en');

    expect(result?.mode).toBe('rule-based');
    expect(result?.caption).toContain('Mutton Briyani');
    expect(result?.caption).toContain('4.5');
    expect(result?.caption).toContain('RM15.00');
  });

  it('rule-based fallback never mentions a rating when there is no review data', async () => {
    mockProduct({ id: 'p1', name: 'New Listing', description: null, base_price: null }, null);
    mocks.callGemini.mockRejectedValue(new Error('down'));

    const result = await draftCopilotCaption('p1', 'en');

    expect(result?.caption).not.toMatch(/★|rated/i);
    expect(result?.caption).not.toContain('RM');
  });

  it('falls back to rule-based when Gemini returns an empty string', async () => {
    mockProduct({ id: 'p1', name: 'White Coffee', description: null, base_price: 8.5 });
    mocks.callGemini.mockResolvedValue('   ');

    const result = await draftCopilotCaption('p1', 'en');

    expect(result?.mode).toBe('rule-based');
  });
});
