import { describe, expect, it } from 'vitest';
import { validateMagicBytes } from '../magic-bytes';

function bufferOf(bytes: number[], totalLength = bytes.length): ArrayBuffer {
  const buffer = new ArrayBuffer(totalLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

describe('validateMagicBytes', () => {
  it('accepts a real jpeg header', async () => {
    expect(await validateMagicBytes(bufferOf([0xff, 0xd8, 0xff]), 'image/jpeg')).toBe(true);
  });

  it('accepts a real png header', async () => {
    expect(await validateMagicBytes(bufferOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png')).toBe(true);
  });

  it('accepts a real pdf header', async () => {
    expect(await validateMagicBytes(bufferOf([0x25, 0x50, 0x44, 0x46]), 'application/pdf')).toBe(true);
  });

  it('accepts a real webp header (RIFF....WEBP)', async () => {
    const bytes = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
    expect(await validateMagicBytes(bufferOf(bytes), 'image/webp')).toBe(true);
  });

  it('rejects a RIFF file that is not webp (e.g. a WAV header)', async () => {
    const bytes = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]; // "RIFF....WAVE"
    expect(await validateMagicBytes(bufferOf(bytes), 'image/webp')).toBe(false);
  });

  it('rejects a mismatched claimed type', async () => {
    expect(await validateMagicBytes(bufferOf([0xff, 0xd8, 0xff]), 'image/png')).toBe(false);
  });

  it('rejects an unsupported claimed type', async () => {
    expect(await validateMagicBytes(bufferOf([0x00]), 'application/zip')).toBe(false);
  });

  it('rejects a buffer too short to hold the signature', async () => {
    expect(await validateMagicBytes(bufferOf([0xff, 0xd8]), 'image/jpeg')).toBe(false);
  });
});
