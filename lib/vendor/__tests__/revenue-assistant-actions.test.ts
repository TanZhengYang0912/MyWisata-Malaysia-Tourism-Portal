import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VendorRevenueSignals } from '../revenue-assistant';

const mocks = vi.hoisted(() => ({ callGemini: vi.fn() }));
vi.mock('@/lib/admin-ai/gemini', () => ({ callGemini: mocks.callGemini }));

const { generateVendorRevenueActions, ruleBasedVendorRevenueActions } = await import('../revenue-assistant');

const NO_DATA_SIGNALS: VendorRevenueSignals = {
  vendorId: 'v1',
  vendorName: 'Test Vendor',
  listingQuality: { totalListings: 3, flagged: [] },
  occupancy: { underbooked: [], wellBooked: [] },
  ratings: { all: [], lowRated: [] },
  refundRisk: [],
};

const SIGNALS_WITH_DATA: VendorRevenueSignals = {
  vendorId: 'v1',
  vendorName: 'Test Vendor',
  listingQuality: {
    totalListings: 5,
    flagged: [{ productId: 'p-incomplete', productName: 'Sunset Tour', issues: ['missing_photo', 'no_available_slots'] }],
  },
  occupancy: {
    underbooked: [{ productId: 'p-underbooked', productName: 'Morning Hike', weekday: 2, weekdayName: 'Tuesday', slotCount: 4, totalCapacity: 40, totalBooked: 4, occupancyRate: 0.1 }],
    wellBooked: [{ productId: 'p-wellbooked', productName: 'Sunset Cruise', weekday: 5, weekdayName: 'Friday', slotCount: 4, totalCapacity: 40, totalBooked: 38, occupancyRate: 0.95 }],
  },
  ratings: {
    all: [{ productId: 'p-lowrated', productName: 'Bumpy Ride', rating: 2.5, reviewCount: 6 }],
    lowRated: [{ productId: 'p-lowrated', productName: 'Bumpy Ride', rating: 2.5, reviewCount: 6 }],
  },
  refundRisk: [{ productId: 'p-refundrisk', productName: 'Rainy Day Trek', reversedCount: 3, settledCount: 5, refundRate: 0.6 }],
};

describe('generateVendorRevenueActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never calls Gemini when nothing was flagged in Parts 1-3', async () => {
    const result = await generateVendorRevenueActions(NO_DATA_SIGNALS, 'en');

    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(result).toEqual({ actions: [], mode: 'no-data' });
  });

  it('accepts a well-formed LLM response across all three categories and attaches real product names', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      actions: [
        { kind: 'incomplete_listing', productId: 'p-incomplete', message: 'Sunset Tour is missing a photo.' },
        { kind: 'promo_timing', productId: 'p-underbooked', message: 'Morning Hike is underbooked on Tuesdays.' },
        { kind: 'quality_attention', productId: 'p-lowrated', message: 'Bumpy Ride has a low rating.' },
        { kind: 'quality_attention', productId: 'p-refundrisk', message: 'Rainy Day Trek has a refund pattern.' },
      ],
    }));

    const result = await generateVendorRevenueActions(SIGNALS_WITH_DATA, 'en');

    expect(result.mode).toBe('llm');
    expect(result.actions).toHaveLength(4);
    expect(result.actions[0]).toMatchObject({ kind: 'incomplete_listing', productId: 'p-incomplete', productName: 'Sunset Tour' });
    expect(result.actions[1]).toMatchObject({ kind: 'promo_timing', productId: 'p-underbooked', productName: 'Morning Hike' });
    expect(result.actions[2]).toMatchObject({ kind: 'quality_attention', productId: 'p-lowrated', productName: 'Bumpy Ride' });
    expect(result.actions[3]).toMatchObject({ kind: 'quality_attention', productId: 'p-refundrisk', productName: 'Rainy Day Trek' });
  });

  it('drops an incomplete_listing action citing a productId NOT in listingQuality.flagged (hallucination guard)', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      actions: [
        { kind: 'incomplete_listing', productId: 'p-does-not-exist', message: 'Invented listing.' },
        { kind: 'promo_timing', productId: 'p-wellbooked', message: 'Real one.' },
      ],
    }));

    const result = await generateVendorRevenueActions(SIGNALS_WITH_DATA, 'en');

    expect(result.mode).toBe('llm');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].productId).toBe('p-wellbooked');
  });

  it('drops a promo_timing action citing a productId not in occupancy signals', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      actions: [{ kind: 'promo_timing', productId: 'p-lowrated', message: 'Wrong category for this id.' }],
    }));

    const result = await generateVendorRevenueActions(SIGNALS_WITH_DATA, 'en');

    expect(result.mode).toBe('rule-based'); // zero actions survived -> falls back
  });

  it('drops a quality_attention action citing a productId not in ratings.lowRated or refundRisk', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      actions: [{ kind: 'quality_attention', productId: 'p-underbooked', message: 'Wrong category for this id.' }],
    }));

    const result = await generateVendorRevenueActions(SIGNALS_WITH_DATA, 'en');

    expect(result.mode).toBe('rule-based');
  });

  it('falls back to rule-based output when Gemini throws', async () => {
    mocks.callGemini.mockRejectedValue(new Error('Gemini generateContent failed: 503'));

    const result = await generateVendorRevenueActions(SIGNALS_WITH_DATA, 'en');

    expect(result.mode).toBe('rule-based');
    expect(result.actions.length).toBeGreaterThan(0);
  });

  it('falls back to rule-based output when Gemini returns malformed JSON', async () => {
    mocks.callGemini.mockResolvedValue('not json at all');

    const result = await generateVendorRevenueActions(SIGNALS_WITH_DATA, 'en');

    expect(result.mode).toBe('rule-based');
  });

  it('falls back to rule-based output when Gemini returns JSON that fails schema validation', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({ actions: [{ kind: 'not_a_real_kind', message: 'x' }] }));

    const result = await generateVendorRevenueActions(SIGNALS_WITH_DATA, 'en');

    expect(result.mode).toBe('rule-based');
  });

  it('caps at 4 actions even if the model returns more', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      actions: [
        { kind: 'incomplete_listing', productId: 'p-incomplete', message: 'one' },
        { kind: 'promo_timing', productId: 'p-underbooked', message: 'two' },
        { kind: 'promo_timing', productId: 'p-wellbooked', message: 'three' },
        { kind: 'quality_attention', productId: 'p-lowrated', message: 'four' },
        { kind: 'quality_attention', productId: 'p-refundrisk', message: 'five' },
      ],
    }));

    const result = await generateVendorRevenueActions(SIGNALS_WITH_DATA, 'en');

    expect(result.actions).toHaveLength(4);
  });

  it('passes the requested language name into the system prompt', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({ actions: [{ kind: 'incomplete_listing', productId: 'p-incomplete', message: '继续' }] }));

    await generateVendorRevenueActions(SIGNALS_WITH_DATA, 'zh');

    expect(mocks.callGemini).toHaveBeenCalledWith(expect.stringContaining('Simplified Chinese'), expect.any(String), expect.any(Object));
  });

  it('sends the real signals to Gemini, nothing invented', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({ actions: [] }));

    await generateVendorRevenueActions(SIGNALS_WITH_DATA, 'en');

    const [, userText] = mocks.callGemini.mock.calls[0];
    expect(JSON.parse(userText)).toEqual(SIGNALS_WITH_DATA);
  });
});

describe('ruleBasedVendorRevenueActions', () => {
  it('every productId it references is real, present in the signals it was given', () => {
    const actions = ruleBasedVendorRevenueActions(SIGNALS_WITH_DATA);

    const validIds = new Set([
      ...SIGNALS_WITH_DATA.listingQuality.flagged.map((f) => f.productId),
      ...SIGNALS_WITH_DATA.occupancy.underbooked.map((s) => s.productId),
      ...SIGNALS_WITH_DATA.occupancy.wellBooked.map((s) => s.productId),
      ...SIGNALS_WITH_DATA.ratings.lowRated.map((r) => r.productId),
      ...SIGNALS_WITH_DATA.refundRisk.map((r) => r.productId),
    ]);
    for (const action of actions) {
      if (action.productId) expect(validIds.has(action.productId)).toBe(true);
    }
  });

  it('covers all four real findings, one action each, up to the cap', () => {
    const actions = ruleBasedVendorRevenueActions(SIGNALS_WITH_DATA);

    expect(actions.map((a) => a.kind)).toEqual(['incomplete_listing', 'promo_timing', 'quality_attention', 'quality_attention']);
    expect(actions[1].productId).toBe('p-underbooked'); // underbooked takes priority over wellBooked
  });

  it('falls back to a wellBooked promo suggestion when there is no underbooked pattern', () => {
    const signals: VendorRevenueSignals = { ...SIGNALS_WITH_DATA, occupancy: { underbooked: [], wellBooked: SIGNALS_WITH_DATA.occupancy.wellBooked } };

    const actions = ruleBasedVendorRevenueActions(signals);

    expect(actions.some((a) => a.productId === 'p-wellbooked')).toBe(true);
  });

  it('returns an empty list when nothing was flagged', () => {
    expect(ruleBasedVendorRevenueActions(NO_DATA_SIGNALS)).toEqual([]);
  });
});
