import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_VENDOR_GALLERY_IMAGES, validateVendorGalleryFiles } from '@/lib/vendor/gallery-files';

const source = readFileSync('components/vendor/vendor-registration-gallery-field.tsx', 'utf8');

describe('vendor registration gallery picker', () => {
  it('accepts a three-photo selection and shows image previews', () => {
    expect(source).toContain('type="file"');
    expect(source).toContain('multiple');
    expect(source).toContain('MAX_VENDOR_GALLERY_IMAGES');
    expect(source).toContain('URL.createObjectURL');
    expect(MAX_VENDOR_GALLERY_IMAGES).toBe(3);
  });

  it('accepts an empty optional gallery or exactly three supported images', () => {
    const photo = { type: 'image/png', size: 12 };
    expect(validateVendorGalleryFiles([])).toEqual({ ok: true });
    expect(validateVendorGalleryFiles([photo, photo], { allowEmpty: false })).toEqual({ ok: false, reason: 'count' });
    expect(validateVendorGalleryFiles([photo, photo, photo])).toEqual({ ok: true });
  });

  it('rejects unsupported formats and oversized gallery photos', () => {
    expect(validateVendorGalleryFiles([
      { type: 'image/gif', size: 12 },
      { type: 'image/png', size: 12 },
      { type: 'image/png', size: 12 },
    ])).toEqual({ ok: false, reason: 'type' });
    expect(validateVendorGalleryFiles([
      { type: 'image/png', size: 12 },
      { type: 'image/png', size: 12 },
      { type: 'image/png', size: 2 * 1024 * 1024 + 1 },
    ])).toEqual({ ok: false, reason: 'size' });
  });

  it('keeps gallery uploads distinct from single cover and logo controls', () => {
    const form = readFileSync('components/vendor/register-vendor-form.tsx', 'utf8');
    expect(form).toContain('VendorRegistrationGalleryField');
    expect(form).toContain("formData.append('galleryFiles', file)");
    expect(form).toContain('id="vendor-cover-file"');
    expect(form).toContain('file={coverFile}');
  });
});
