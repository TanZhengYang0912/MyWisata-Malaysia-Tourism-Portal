import { afterEach, describe, expect, it, vi } from 'vitest';
import { draftVendorActionReason } from '@/lib/vendors/action-draft';

const context = {
  vendorName: 'Rasa Malaysia Kitchen',
  businessType: 'restaurant',
  description: 'A cozy local eatery loved by regulars.',
  contactName: 'Ah Meng',
};

describe('draftVendorActionReason', () => {
  const originalKey = process.env.LLM_API_KEY;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = originalKey;
  });

  it('returns null when no API key is configured', async () => {
    delete process.env.LLM_API_KEY;
    await expect(draftVendorActionReason('reject', context)).resolves.toBeNull();
  });

  it('returns the drafted reason text for each action', async () => {
    process.env.LLM_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Please provide your business registration document.' }] } }] }), { status: 200 }),
    ));

    for (const action of ['reject', 'suspend', 'request_information'] as const) {
      await expect(draftVendorActionReason(action, context)).resolves.toBe('Please provide your business registration document.');
    }
  });

  it('sends a different system prompt per action', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await draftVendorActionReason('reject', context);
    await draftVendorActionReason('suspend', context);
    const rejectPrompt = JSON.parse(fetchMock.mock.calls[0][1].body).systemInstruction.parts[0].text;
    const suspendPrompt = JSON.parse(fetchMock.mock.calls[1][1].body).systemInstruction.parts[0].text;
    expect(rejectPrompt).toContain('REJECTED');
    expect(suspendPrompt).toContain('SUSPENDED');
    expect(rejectPrompt).not.toEqual(suspendPrompt);
  });

  it('returns null on empty text or a non-2xx response', async () => {
    process.env.LLM_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 500 })));
    await expect(draftVendorActionReason('suspend', context)).resolves.toBeNull();
  });

  it('withholds the full action prompt when any business field contains personal data', async () => {
    process.env.LLM_API_KEY = 'test-key';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(draftVendorActionReason('reject', { ...context, description: 'Contact us at owner@example.com for details.' })).resolves.toEqual({ error: 'sensitive_data_detected' });
    await expect(draftVendorActionReason('reject', { ...context, vendorName: 'Call 012-3456789' })).resolves.toEqual({ error: 'sensitive_data_detected' });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
