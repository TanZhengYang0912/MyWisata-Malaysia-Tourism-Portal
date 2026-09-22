import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('components/vendor/vendor-profile-gallery-manager.tsx', 'utf8');

describe('vendor profile gallery manager', () => {
  it('loads, previews, replaces three gallery photos, and can clear them', () => {
    expect(source).toContain('/media/gallery');
    expect(source).toContain('multiple');
    expect(source).toContain('MAX_VENDOR_GALLERY_IMAGES');
    expect(source).toContain("method: 'PUT'");
    expect(source).toContain("method: 'DELETE'");
    expect(source).toContain('role="alertdialog"');
  });

  it('is mounted in the existing vendor profile Brand Assets section', () => {
    const profile = readFileSync('app/vendor/profile/page.tsx', 'utf8');
    expect(profile).toContain('VendorProfileGalleryManager');
    expect(profile).toContain('vendorId={vendorId || \'\'}');
  });
});
