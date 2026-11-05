import { afterEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
vi.mock('server-only', () => ({}));
import { prepareKycEvidenceImage } from '../evidence-image';

describe('KYC evidence images', () => {
  afterEach(() => vi.restoreAllMocks());
  it.each(['image/jpeg', 'image/png', 'image/webp'])('strips metadata and burns a watermark into %s pixels', async (mime) => {
    const image = sharp({ create: { width: 900, height: 560, channels: 3, background: '#eeeeee' } });
    const original = await image.withExif({ IFD0: { Artist: 'sensitive-device' } }).toFormat(mime.split('/')[1] as 'jpeg' | 'png' | 'webp').toBuffer();
    const composite = vi.spyOn(sharp.prototype, 'composite');
    const result = await prepareKycEvidenceImage(original, mime);
    const layers: unknown = composite.mock.calls[0]?.[0];
    const layer: unknown = Array.isArray(layers) ? layers[0] : null;
    const overlay = layer && typeof layer === 'object' && 'input' in layer ? layer.input : null;
    expect(Buffer.isBuffer(overlay)).toBe(true);
    expect(String(overlay)).toContain('FOR MYLAWATAN KYC VERIFICATION ONLY');
    expect(String(overlay)).not.toMatch(/mywisata/i);
    expect((await sharp(result.ocr).metadata()).exif).toBeUndefined();
    expect((await sharp(result.stored).metadata()).exif).toBeUndefined();
    expect(await sharp(result.stored).raw().toBuffer()).not.toEqual(await sharp(result.ocr).raw().toBuffer());
    expect((await sharp(result.stored).metadata()).width).toBe(900);
  });
  it('rejects fake images', async () => {
    await expect(prepareKycEvidenceImage(Buffer.from('fake'), 'image/jpeg')).rejects.toThrow();
  });
});
