import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { buildContentPrompt, generateContentDraft, parseContentDraft } from '@/lib/ai/content-assistant';

describe('content assistant contracts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('builds grounded business-profile instructions from the supplied facts', () => {
    const prompt = buildContentPrompt('business_profile', { name: 'Rasa Malaysia Kitchen', businessType: 'Food & tourism', description: 'Local Malaysian flavours.' });

    expect(prompt).toContain('Rasa Malaysia Kitchen');
    expect(prompt).toContain('Do not invent');
    expect(prompt).toContain('plain text');
  });

  it('parses outlet hero JSON and rejects malformed output', () => {
    expect(parseContentDraft('outlet_page', '{"title":"Taste Georgetown","body":"Local flavours near the waterfront.","cta":"View menu"}')).toEqual({
      title: 'Taste Georgetown',
      body: 'Local flavours near the waterfront.',
      cta: 'View menu',
    });
    expect(parseContentDraft('outlet_page', 'not json')).toBeNull();
  });

  it('recovers hero JSON wrapped in prose and keeps the SEO description', () => {
    expect(parseContentDraft('outlet_page', 'Here is your copy: {"title":"Ghee Hiang at Jalan Burma","body":"Sesame oil and biscuits from George Town.","cta":"Shop now","seoDescription":"Ghee Hiang sesame oil and Penang biscuits."} Hope it helps!')).toEqual({
      title: 'Ghee Hiang at Jalan Burma',
      body: 'Sesame oil and biscuits from George Town.',
      cta: 'Shop now',
      seoDescription: 'Ghee Hiang sesame oil and Penang biscuits.',
    });
  });

  it('keeps plain-text drafts bounded for profile and reply surfaces', () => {
    expect(parseContentDraft('business_profile', '  A polished description.  ')).toBe('A polished description.');
    expect(parseContentDraft('inbox_reply', '   Thanks for reaching out.   ')).toBe('Thanks for reaching out.');
  });

  it('uses Gemini to generate a business-profile draft', async () => {
    vi.stubEnv('LLM_API_KEY', 'gemini-test-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'Traditional tau sar pneah made in Penang.' }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateContentDraft('business_profile', {
      name: 'Ghee Hiang', description: 'Tau sar pneah and sesame oil, made in Penang since 1856.',
    })).resolves.toEqual({
      available: true,
      provider: 'gemini',
      model: 'gemini-flash-lite-latest',
      draft: 'Traditional tau sar pneah made in Penang.',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
      expect.objectContaining({ headers: expect.objectContaining({ 'x-goog-api-key': 'gemini-test-token' }) }),
    );
  });

  it('withholds customer contact details from the provider instead of redacting and sending the rest', async () => {
    vi.stubEnv('MODELSCOPE_API_KEY', 'test-token');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateContentDraft('business_profile', {
      name: 'Rasa Kitchen', description: 'Call 012-3456789 for a booking.',
    })).resolves.toEqual({ available: false, reason: 'sensitive_input' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
