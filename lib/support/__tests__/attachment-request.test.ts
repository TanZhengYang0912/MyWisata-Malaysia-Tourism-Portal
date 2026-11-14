import { describe, expect, it } from 'vitest';
import { readTicketAttachmentForm } from '../attachment';

const MAX_MULTIPART_BYTES = 10 * 1024 * 1024 + 64 * 1024;

describe('readTicketAttachmentForm', () => {
  it('parses an ordinary bounded multipart form', async () => {
    const data = new FormData();
    data.set('operationId', '7b456ed4-615e-4210-a704-840abc4c1790');
    data.set('caption', 'A short note');
    const request = new Request('http://localhost/upload', { method: 'POST', body: data });

    const result = await readTicketAttachmentForm(request);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.get('operationId')).toBe('7b456ed4-615e-4210-a704-840abc4c1790');
      expect(result.data.get('caption')).toBe('A short note');
    }
  });

  it('rejects a declared oversized request before reading its body', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([1]));
        controller.close();
      },
    });
    const request = new Request('http://localhost/upload', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(MAX_MULTIPART_BYTES + 1) },
      body,
      duplex: 'half',
    } as RequestInit);

    expect(await readTicketAttachmentForm(request)).toEqual({ ok: false, reason: 'too_large' });
    expect(request.bodyUsed).toBe(false);
  });

  it('enforces the same bound when content length is missing or inaccurate', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_MULTIPART_BYTES + 1));
        controller.close();
      },
    });
    const request = new Request('http://localhost/upload', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      body,
      duplex: 'half',
    } as RequestInit);

    expect(await readTicketAttachmentForm(request)).toEqual({ ok: false, reason: 'too_large' });
  });

  it('returns a recoverable form error for malformed multipart input', async () => {
    const request = new Request('http://localhost/upload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    expect(await readTicketAttachmentForm(request)).toEqual({ ok: false, reason: 'invalid_form' });
  });
});
