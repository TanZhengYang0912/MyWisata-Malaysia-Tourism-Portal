import { afterEach, describe, expect, it, vi } from 'vitest';
import { draftVendorInviteEmail } from '@/lib/recommendations/invite-draft';

const context = {
  vendorName: 'Rasa Malaysia Kitchen',
  description: 'A cozy local eatery loved by regulars.',
  vendorAddress: '123 Jalan Example',
  category: 'Food & Dining',
};

describe('draftVendorInviteEmail', () => {
  const originalKey = process.env.LLM_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = originalKey;
  });

  it('returns null when no API key is configured', async () => {
    delete process.env.LLM_API_KEY;
    await expect(draftVendorInviteEmail(context)).resolves.toBeNull();
  });

  it('parses a well-formed SUBJECT/BODY response', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const text = 'SUBJECT: Join MyWisata as a featured vendor\nBODY: We think Rasa Malaysia Kitchen would be a great fit.\nUse the sign-up link included below to get started.';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 }),
    ));

    await expect(draftVendorInviteEmail(context)).resolves.toEqual({
      subject: 'Join MyWisata as a featured vendor',
      body: 'We think Rasa Malaysia Kitchen would be a great fit.\nUse the sign-up link included below to get started.',
    });
  });

  it('returns null when the response is missing BODY', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const text = 'SUBJECT: Join MyWisata';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 }),
    ));

    await expect(draftVendorInviteEmail(context)).resolves.toBeNull();
  });

  it('returns null on a non-2xx response', async () => {
    process.env.LLM_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 500 })));

    await expect(draftVendorInviteEmail(context)).resolves.toBeNull();
  });

  it('redacts PII from the description before prompting', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'SUBJECT: Hi\nBODY: Hello there.' }] } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await draftVendorInviteEmail({ ...context, description: 'Contact us at owner@example.com for details.' });

    const body = JSON.stringify(fetchMock.mock.calls[0]?.[1]?.body);
    expect(body).not.toContain('owner@example.com');
    expect(body).toContain('[EMAIL]');
  });
});
