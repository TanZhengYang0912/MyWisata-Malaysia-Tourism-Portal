import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BudgetGuardResult } from '../budget-guard';

const mocks = vi.hoisted(() => ({ callGemini: vi.fn() }));
vi.mock('@/lib/admin-ai/gemini', () => ({ callGemini: mocks.callGemini }));
// budget-guard.ts imports getComputedActivity/searchActivities from here at
// module scope; that module eagerly builds a browser Supabase client, which
// needs env vars unit tests don't have — mock it out (unused by these tests,
// which exercise generateBudgetGuardMessages()/ruleBasedBudgetGuardMessages() only).
vi.mock('@/backend/domains/catalogue', () => ({ getComputedActivity: vi.fn(), searchActivities: vi.fn() }));

const { generateBudgetGuardMessages, ruleBasedBudgetGuardMessages } = await import('../budget-guard');

const WITHIN_BUDGET: BudgetGuardResult = {
  totalRM: 50, budgetRM: 100, isOverBudget: false, overBudgetByRM: 0, overBudgetItems: [],
};

const OVER_BUDGET: BudgetGuardResult = {
  totalRM: 350, budgetRM: 100, isOverBudget: true, overBudgetByRM: 250,
  overBudgetItems: [
    {
      productId: 'p-stay', name: 'Heritage Room', price: 230, qty: 1, lineTotalRM: 230,
      alternatives: [
        { productId: 'alt-1', name: 'Budget Stay', price: 150, rating: 4.5, reviews: 20, savingsRM: 80, lat: 5.42, lng: 100.33, image: null },
        { productId: 'alt-2', name: 'Hostel Bed', price: 60, rating: 4.0, reviews: 10, savingsRM: 170, lat: 5.41, lng: 100.32, image: 'https://example.com/hostel.jpg' },
      ],
    },
    {
      productId: 'p-tour', name: 'Private Island Tour', price: 120, qty: 1, lineTotalRM: 120,
      alternatives: [], // genuinely nothing cheaper found for this one
    },
  ],
};

const NO_ALTERNATIVES_ANYWHERE: BudgetGuardResult = {
  totalRM: 200, budgetRM: 100, isOverBudget: true, overBudgetByRM: 100,
  overBudgetItems: [{ productId: 'p1', name: 'Only Expensive Option', price: 200, qty: 1, lineTotalRM: 200, alternatives: [] }],
};

describe('generateBudgetGuardMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never calls Gemini when within budget', async () => {
    const result = await generateBudgetGuardMessages(WITHIN_BUDGET, 'en');

    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(result).toEqual({ messages: [], mode: 'within-budget' });
  });

  it('never calls Gemini when over budget but no real alternative exists anywhere', async () => {
    const result = await generateBudgetGuardMessages(NO_ALTERNATIVES_ANYWHERE, 'en');

    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(result).toEqual({ messages: [], mode: 'rule-based' });
  });

  it('accepts a well-formed LLM response and attaches the real names/savings', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      messages: [{ originalProductId: 'p-stay', alternativeProductId: 'alt-1', message: 'Consider the Budget Stay instead — you save RM80.' }],
    }));

    const result = await generateBudgetGuardMessages(OVER_BUDGET, 'en');

    expect(result.mode).toBe('llm');
    expect(result.messages).toEqual([{
      originalProductId: 'p-stay', originalName: 'Heritage Room',
      alternativeProductId: 'alt-1', alternativeName: 'Budget Stay',
      savingsRM: 80, message: 'Consider the Budget Stay instead — you save RM80.',
      alternativeLat: 5.42, alternativeLng: 100.33, alternativeImage: null,
    }]);
  });

  it('drops a pairing whose alternative does not actually belong to the stated original item (hallucination guard)', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      messages: [
        // alt-1 is real, but it belongs to p-stay, not p-tour — cross-item mixing must be rejected.
        { originalProductId: 'p-tour', alternativeProductId: 'alt-1', message: 'Invented pairing.' },
      ],
    }));

    const result = await generateBudgetGuardMessages(OVER_BUDGET, 'en');

    expect(result.mode).toBe('rule-based'); // zero messages survived -> falls back
  });

  it('drops a pairing citing a completely invented alternative id', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      messages: [
        { originalProductId: 'p-stay', alternativeProductId: 'totally-made-up', message: 'Invented.' },
        { originalProductId: 'p-stay', alternativeProductId: 'alt-2', message: 'Real pairing.' },
      ],
    }));

    const result = await generateBudgetGuardMessages(OVER_BUDGET, 'en');

    expect(result.mode).toBe('llm');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].alternativeProductId).toBe('alt-2');
  });

  it('falls back to rule-based output when Gemini throws', async () => {
    mocks.callGemini.mockRejectedValue(new Error('Gemini generateContent failed: 503'));

    const result = await generateBudgetGuardMessages(OVER_BUDGET, 'en');

    expect(result.mode).toBe('rule-based');
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it('falls back to rule-based output when Gemini returns malformed JSON', async () => {
    mocks.callGemini.mockResolvedValue('not json at all');

    const result = await generateBudgetGuardMessages(OVER_BUDGET, 'en');

    expect(result.mode).toBe('rule-based');
  });

  it('falls back to rule-based output when Gemini returns JSON that fails schema validation', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({ messages: [{ originalProductId: 'p-stay' }] }));

    const result = await generateBudgetGuardMessages(OVER_BUDGET, 'en');

    expect(result.mode).toBe('rule-based');
  });

  it('passes the requested language name into the system prompt', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({ messages: [{ originalProductId: 'p-stay', alternativeProductId: 'alt-1', message: '换成这个更便宜' }] }));

    await generateBudgetGuardMessages(OVER_BUDGET, 'zh');

    expect(mocks.callGemini).toHaveBeenCalledWith(expect.stringContaining('Simplified Chinese'), expect.any(String), expect.any(Object));
  });

  it('sends only the real computed result to Gemini', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({ messages: [] }));

    await generateBudgetGuardMessages(OVER_BUDGET, 'en').catch(() => undefined);

    const [, userText] = mocks.callGemini.mock.calls[0];
    expect(JSON.parse(userText)).toEqual(OVER_BUDGET);
  });
});

describe('ruleBasedBudgetGuardMessages', () => {
  it('picks the biggest real saving per over-budget item, skipping items with no alternatives', () => {
    const messages = ruleBasedBudgetGuardMessages(OVER_BUDGET);

    expect(messages).toHaveLength(1); // p-tour has no alternatives — skipped
    expect(messages[0]).toMatchObject({ originalProductId: 'p-stay', alternativeProductId: 'alt-2', savingsRM: 170 }); // alt-2 saves more than alt-1
  });

  it('carries the real alternative coordinate/image through, for a map pin — never invented', () => {
    const messages = ruleBasedBudgetGuardMessages(OVER_BUDGET);

    expect(messages[0]).toMatchObject({ alternativeLat: 5.41, alternativeLng: 100.32, alternativeImage: 'https://example.com/hostel.jpg' });
  });

  it('returns an empty list when nothing is over budget', () => {
    expect(ruleBasedBudgetGuardMessages(WITHIN_BUDGET)).toEqual([]);
  });
});
