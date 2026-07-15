import { describe, expect, it } from 'vitest';
import { buildChatAttachmentPath, validateChatAttachment } from '../attachment';

const JPEG_HEADER = [0xff, 0xd8, 0xff];

function fakeFile(overrides: Partial<{ type: string; size: number; bytes: number[] }> = {}) {
  const bytes = overrides.bytes ?? JPEG_HEADER;
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return {
    type: overrides.type ?? 'image/jpeg',
    size: overrides.size ?? bytes.length,
    arrayBuffer: async () => buffer,
  };
}

describe('validateChatAttachment', () => {
  it('accepts a real jpeg under the size limit', async () => {
    const result = await validateChatAttachment(fakeFile());
    expect(result.ok).toBe(true);
  });

  it('rejects a disallowed mime type', async () => {
    const result = await validateChatAttachment(fakeFile({ type: 'application/zip' }));
    expect(result).toEqual({ ok: false, code: 'INVALID_FILE_TYPE' });
  });

  it('rejects a file over 10MB', async () => {
    const result = await validateChatAttachment(fakeFile({ size: 10 * 1024 * 1024 + 1 }));
    expect(result).toEqual({ ok: false, code: 'FILE_TOO_LARGE' });
  });

  it('rejects content whose bytes do not match the claimed type', async () => {
    const result = await validateChatAttachment(fakeFile({ type: 'image/png', bytes: JPEG_HEADER }));
    expect(result).toEqual({ ok: false, code: 'INVALID_FILE_CONTENT' });
  });
});

describe('buildChatAttachmentPath', () => {
  it('nests the file under the thread id folder with the right extension', () => {
    expect(buildChatAttachmentPath('thread-1', 'token-1', 'image/webp')).toBe('thread-1/token-1.webp');
    expect(buildChatAttachmentPath('thread-1', 'token-1', 'application/pdf')).toBe('thread-1/token-1.pdf');
  });
});
