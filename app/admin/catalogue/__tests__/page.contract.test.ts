import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(process.cwd(), 'app/admin/catalogue/page.tsx'),
  'utf8',
);

describe('catalogue review modal layout', () => {
  it('uses the shared centered review surface instead of a right-side drawer', () => {
    expect(pageSource).toContain('role="dialog"');
    expect(pageSource).toContain('aria-modal="true"');
    expect(pageSource).toContain('items-center justify-center');
    expect(pageSource).toContain('max-h-[90vh]');
    expect(pageSource).toContain('max-w-2xl');
  });
});
