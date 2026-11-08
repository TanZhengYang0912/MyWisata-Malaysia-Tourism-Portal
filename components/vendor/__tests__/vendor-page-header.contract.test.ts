import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const path = resolve(process.cwd(), 'components/vendor/vendor-page-header.tsx');
const source = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('VendorPageHeader interface', () => {
  it('provides one responsive heading with optional eyebrow, description, and actions', () => {
    expect(source).toContain('export function VendorPageHeader');
    expect(source).toContain('eyebrow?: ReactNode');
    expect(source).toContain('description?: ReactNode');
    expect(source).toContain('actions?: ReactNode');
    expect(source).toContain('<h1');
    expect(source).toContain('md:flex-row');
  });
});
