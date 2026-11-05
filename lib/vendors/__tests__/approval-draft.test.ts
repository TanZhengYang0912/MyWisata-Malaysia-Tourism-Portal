import { afterEach, describe, expect, it, vi } from 'vitest';
import { draftVendorApprovalEmail } from '@/lib/vendors/approval-draft';

const context = {
  vendorName: 'Rasa Malaysia Kitchen',
  businessType: 'restaurant',
  description: 'A cozy local eatery loved by regulars.',
  contactName: 'Ah Meng',
  address: '123 Jalan Example',
};

describe('draftVendorApprovalEmail', () => {
  const originalKey = process.env.LLM_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = originalKey;
  });

  it('returns null when no API key is configured', async () => {
    delete process.env.LLM_API_KEY;
    await expect(draftVendorApprovalEmail(context)).resolves.toBeNull();
  });

  it('parses a well-formed SUBJECT/BODY response', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const text = "SUBJECT: Congratulations, Rasa Malaysia Kitchen is approved!\nBODY: Hi Ah Meng, we're thrilled to welcome Rasa Malaysia Kitchen to MYLawatan.\nLog in using the link below to get started.";
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 }),
    ));

    await expect(draftVendorApprovalEmail(context)).resolves.toEqual({
      subject: 'Congratulations, Rasa Malaysia Kitchen is approved!',
      body: "Hi Ah Meng, we're thrilled to welcome Rasa Malaysia Kitchen to MYLawatan.\nLog in using the link below to get started.",
    });
  });

  it('instructs the model to write in the recipient language', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'SUBJECT: Welcome\nBODY: Congratulations!' }] } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await draftVendorApprovalEmail({ ...context, locale: 'zh-CN' });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody.systemInstruction.parts[0].text).toContain('Simplified Chinese');
    expect(requestBody.systemInstruction.parts[0].text).toContain('Keep the SUBJECT: and BODY: parser labels unchanged.');
  });

  it('returns null when the response is missing BODY', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const text = 'SUBJECT: Congratulations!';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 }),
    ));

    await expect(draftVendorApprovalEmail(context)).resolves.toBeNull();
  });

  it('returns null on a non-2xx response', async () => {
    process.env.LLM_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 500 })));

    await expect(draftVendorApprovalEmail(context)).resolves.toBeNull();
  });

  it('withholds the full approval prompt when a business field contains personal data', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(draftVendorApprovalEmail({ ...context, description: 'Contact us at owner@example.com for details.' })).resolves.toEqual({ error: 'sensitive_data_detected' });
    await expect(draftVendorApprovalEmail({ ...context, businessType: 'Call 012-3456789' })).resolves.toEqual({ error: 'sensitive_data_detected' });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
