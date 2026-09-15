import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CopilotSignals } from '../copilot';

const mocks = vi.hoisted(() => ({ callGemini: vi.fn() }));
vi.mock('@/lib/admin-ai/gemini', () => ({ callGemini: mocks.callGemini }));

const { generateCopilotActions, ruleBasedCopilotActions } = await import('../copilot');

const SIGNALS_WITH_DATA: CopilotSignals = {
  affiliateCode: 'AF-TEST01',
  hasActivity: true,
  topConverting: [
    { productId: 'p-strong', productName: 'Mutton Briyani', shares: 2, clicks: 5, referrals: 2, earnings: 0.66, reversedReferrals: 0, conversionRate: 0.4 },
  ],
  underperforming: [
    { productId: 'p-weak', productName: 'Heritage Family Room', shares: 0, clicks: 3, referrals: 0, earnings: 0, reversedReferrals: 0, conversionRate: 0 },
  ],
  byChannel: [
    { platform: 'native', shares: 3, clicks: 5, conversions: 2 },
    { platform: 'copy_link', shares: 1, clicks: 0, conversions: 0 },
  ],
  byCampaign: [
    { campaign: 'test-jan', clicks: 3, referrals: 1, earnings: 0.48 },
  ],
  opportunities: [
    { productId: 'p-opp-1', productName: 'White Coffee', reason: 'highly_rated', rating: 5, reviewCount: 3 },
  ],
  refundRisk: [
    { productId: 'p-risky', productName: 'Sunset Catamaran Cruise', shares: 1, clicks: 4, referrals: 1, earnings: 0.3, reversedReferrals: 3, refundRate: 0.75 },
  ],
  sourceTrackingActive: true,
};

const NO_ACTIVITY_SIGNALS: CopilotSignals = {
  affiliateCode: null,
  hasActivity: false,
  topConverting: [],
  underperforming: [],
  byChannel: [],
  byCampaign: [],
  opportunities: [],
  refundRisk: [],
  sourceTrackingActive: false,
};

describe('generateCopilotActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('never calls Gemini for a brand-new affiliate with no activity', async () => {
    const result = await generateCopilotActions(NO_ACTIVITY_SIGNALS, 'en');

    expect(mocks.callGemini).not.toHaveBeenCalled();
    expect(result.mode).toBe('no-activity');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].kind).toBe('general');
  });

  it('accepts a well-formed LLM response and attaches the real product name', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      actions: [
        { kind: 'share_listing', productId: 'p-opp-1', message: 'White Coffee is converting well for other affiliates.' },
        { kind: 'reconsider_listing', productId: 'p-weak', message: 'Heritage Family Room has clicks but no bookings yet.' },
      ],
    }));

    const result = await generateCopilotActions(SIGNALS_WITH_DATA, 'en');

    expect(result.mode).toBe('llm');
    expect(result.actions).toHaveLength(2);
    expect(result.actions[0]).toMatchObject({ kind: 'share_listing', productId: 'p-opp-1', productName: 'White Coffee' });
    expect(result.actions[1]).toMatchObject({ kind: 'reconsider_listing', productId: 'p-weak', productName: 'Heritage Family Room' });
  });

  it('drops a share_listing action citing a productId NOT in opportunities (hallucination guard)', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      actions: [
        { kind: 'share_listing', productId: 'p-does-not-exist', message: 'Share this amazing listing!' },
        { kind: 'try_channel', platform: 'native', message: 'Your share-sheet shares convert well.' },
      ],
    }));

    const result = await generateCopilotActions(SIGNALS_WITH_DATA, 'en');

    expect(result.mode).toBe('llm');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].kind).toBe('try_channel');
  });

  it('drops a reconsider_listing action citing a productId that is actually a topConverting listing, not underperforming', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      actions: [{ kind: 'reconsider_listing', productId: 'p-strong', message: 'This one needs work.' }],
    }));

    const result = await generateCopilotActions(SIGNALS_WITH_DATA, 'en');

    expect(result.mode).toBe('rule-based'); // zero actions survived validation -> falls back
  });

  it('drops a try_channel action citing a platform not present in byChannel', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      actions: [
        { kind: 'try_channel', platform: 'instagram_stories_totally_made_up', message: 'Try Instagram Stories!' },
        { kind: 'general', message: 'Keep sharing regularly.' },
      ],
    }));

    const result = await generateCopilotActions(SIGNALS_WITH_DATA, 'en');

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].kind).toBe('general');
  });

  it('falls back to rule-based output when Gemini throws', async () => {
    mocks.callGemini.mockRejectedValue(new Error('Gemini generateContent failed: 503'));

    const result = await generateCopilotActions(SIGNALS_WITH_DATA, 'en');

    expect(result.mode).toBe('rule-based');
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.actions.every((a) => !a.productId || ['p-opp-1', 'p-weak', 'p-risky'].includes(a.productId))).toBe(true);
  });

  it('accepts a refund_risk action citing a real refundRisk listing', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      actions: [{ kind: 'refund_risk', productId: 'p-risky', message: 'Several orders from this listing were later refunded.' }],
    }));

    const result = await generateCopilotActions(SIGNALS_WITH_DATA, 'en');

    expect(result.mode).toBe('llm');
    expect(result.actions[0]).toMatchObject({ kind: 'refund_risk', productId: 'p-risky', productName: 'Sunset Catamaran Cruise' });
  });

  it('drops a refund_risk action citing a productId NOT in refundRisk (hallucination guard)', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      actions: [
        { kind: 'refund_risk', productId: 'p-strong', message: 'This one has refund problems.' },
        { kind: 'general', message: 'Keep sharing regularly.' },
      ],
    }));

    const result = await generateCopilotActions(SIGNALS_WITH_DATA, 'en');

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].kind).toBe('general');
  });

  it('falls back to rule-based output when Gemini returns malformed JSON', async () => {
    mocks.callGemini.mockResolvedValue('not json at all');

    const result = await generateCopilotActions(SIGNALS_WITH_DATA, 'en');

    expect(result.mode).toBe('rule-based');
  });

  it('falls back to rule-based output when Gemini returns JSON that fails schema validation', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({ actions: [{ kind: 'not_a_real_kind', message: 'x' }] }));

    const result = await generateCopilotActions(SIGNALS_WITH_DATA, 'en');

    expect(result.mode).toBe('rule-based');
  });

  it('caps at 4 actions even if the model returns more', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({
      actions: [
        { kind: 'general', message: 'one' }, { kind: 'general', message: 'two' },
        { kind: 'general', message: 'three' }, { kind: 'general', message: 'four' }, { kind: 'general', message: 'five' },
      ],
    }));

    const result = await generateCopilotActions(SIGNALS_WITH_DATA, 'en');

    expect(result.actions).toHaveLength(4);
  });

  it('passes the requested language name into the system prompt', async () => {
    mocks.callGemini.mockResolvedValue(JSON.stringify({ actions: [{ kind: 'general', message: '继续分享吧！' }] }));

    await generateCopilotActions(SIGNALS_WITH_DATA, 'zh');

    expect(mocks.callGemini).toHaveBeenCalledWith(expect.stringContaining('Simplified Chinese'), expect.any(String), expect.any(Object));
  });
});

describe('ruleBasedCopilotActions', () => {
  it('every productId/platform it references is real, present in the signals it was given', () => {
    const actions = ruleBasedCopilotActions(SIGNALS_WITH_DATA);

    const validProductIds = new Set([...SIGNALS_WITH_DATA.opportunities.map((o) => o.productId), ...SIGNALS_WITH_DATA.underperforming.map((p) => p.productId), ...SIGNALS_WITH_DATA.refundRisk.map((p) => p.productId)]);
    const validPlatforms = new Set(SIGNALS_WITH_DATA.byChannel.map((c) => c.platform));
    for (const action of actions) {
      if (action.productId) expect(validProductIds.has(action.productId)).toBe(true);
      if (action.platform) expect(validPlatforms.has(action.platform)).toBe(true);
    }
  });

  it('returns a friendly single action for a signals object with no data at all', () => {
    const actions = ruleBasedCopilotActions(NO_ACTIVITY_SIGNALS);
    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe('general');
  });
});
