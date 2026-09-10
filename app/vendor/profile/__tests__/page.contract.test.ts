import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync('app/vendor/profile/page.tsx', 'utf8');

describe('vendor profile image URL contract', () => {
  it('normalizes stored vendor image paths before rendering previews', () => {
    expect(source).toContain("import { vendorImageUrl } from '@/lib/storage/vendor-image';");
    expect(source).toContain('value={vendorImageUrl(form.logoUrl)}');
    expect(source).toContain('value={vendorImageUrl(form.coverUrl)}');
    expect(source).toContain('const resolvedSrc = vendorImageUrl(src);');
  });
});
