import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { buildContentPrompt, parseContentDraft } from '@/lib/ai/content-assistant';

describe('content assistant contracts', () => {
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

  it('keeps plain-text drafts bounded for profile and reply surfaces', () => {
    expect(parseContentDraft('business_profile', '  A polished description.  ')).toBe('A polished description.');
    expect(parseContentDraft('inbox_reply', '   Thanks for reaching out.   ')).toBe('Thanks for reaching out.');
  });
});
