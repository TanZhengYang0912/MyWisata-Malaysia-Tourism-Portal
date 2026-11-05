import 'server-only';
import sharp from 'sharp';
import { BRAND_NAME } from '@/lib/i18n/invariant-tokens';

/** Decode bounded images, strip metadata and burn the purpose into stored pixels. */
export async function prepareKycEvidenceImage(bytes: Buffer, mimeType: string) {
  const format = mimeType === 'image/jpeg' ? 'jpeg' : mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : null;
  if (!format) throw new Error('Unsupported KYC image');
  const { data: ocr, info } = await sharp(bytes, { limitInputPixels: 20_000_000, animated: false }).timeout({ seconds: 5 })
    .rotate().toFormat(format).toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const fontSize = Math.max(8, Math.round(width / 36));
  const spacing = Math.max(30, Math.round(height / 4));
  const rows = Array.from({ length: 7 }, (_, index) => {
    const y = (index - 1) * spacing;
    return `<text x="${width / 2}" y="${y}" text-anchor="middle">FOR ${BRAND_NAME.toUpperCase()} KYC VERIFICATION ONLY</text>`;
  }).join('');
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g transform="rotate(-18 ${width / 2} ${height / 2})" font-family="sans-serif" font-size="${fontSize}" font-weight="bold" fill="#555555" fill-opacity="0.32">${rows}</g></svg>`);
  const stored = await sharp(ocr).timeout({ seconds: 5 }).composite([{ input: overlay }]).toFormat(format).toBuffer();
  if (stored.length > 5 * 1024 * 1024) throw new Error('Processed KYC image exceeds size limit');
  return { ocr, stored };
}
