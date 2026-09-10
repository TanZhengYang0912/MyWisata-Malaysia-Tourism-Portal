import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'app/vendor/loading.tsx'), 'utf8');

describe('Vendor route loading page', () => {
  it('uses a neutral centered status instead of a dashboard table skeleton', () => {
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('items-center justify-center');
    expect(source).toContain('animate-spin');
    expect(source).not.toContain('grid grid-cols-2 lg:grid-cols-4');
    expect(source).not.toContain('Table skeleton');
  });
});
