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
    const text = 'SUBJECT: Join MYLawatan as a featured vendor\nBODY: We think Rasa Malaysia Kitchen would be a great fit.\nUse the sign-up link included below to get started.';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 }),
    ));

    await expect(draftVendorInviteEmail(context)).resolves.toEqual({
      subject: 'Join MYLawatan as a featured vendor',
      body: 'We think Rasa Malaysia Kitchen would be a great fit.\nUse the sign-up link included below to get started.',
    });
  });

  it('instructs the model to write in the recipient language', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'SUBJECT: Jemputan\nBODY: Sila sertai kami.' }] } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await draftVendorInviteEmail({ ...context, locale: 'zh-CN' });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.systemInstruction.parts[0].text).toContain('Simplified Chinese');
    expect(requestBody.systemInstruction.parts[0].text).toContain('Keep the SUBJECT: and BODY: parser labels unchanged.');
  });

  it('returns null when the response is missing BODY', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const text = 'SUBJECT: Join MYLawatan';
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

  it('withholds the full vendor invitation prompt when a customer detail is present', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(draftVendorInviteEmail({ ...context, description: 'Contact us at owner@example.com for details.' })).resolves.toEqual({ error: 'sensitive_data_detected' });
    await expect(draftVendorInviteEmail({ ...context, vendorName: 'Call 012-3456789' })).resolves.toEqual({ error: 'sensitive_data_detected' });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
