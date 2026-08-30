import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(process.cwd(), 'app/admin/catalogue/page.tsx'),
  'utf8',
);
const batchActionBarSource = readFileSync(
  resolve(process.cwd(), 'components/admin/batch-action-bar.tsx'),
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

  it('uses semantic theme surfaces instead of light-only catalogue colours', () => {
    expect(pageSource).toContain('border-border bg-card');
    expect(pageSource).toContain('text-foreground');
    expect(pageSource).toContain('text-muted-foreground');
    expect(pageSource).not.toMatch(/(?:bg|text|border)-gray-/);
    expect(pageSource).not.toContain('bg-white');
  });

  it('keeps shared batch actions theme-aware', () => {
    expect(batchActionBarSource).toContain('bg-card');
    expect(batchActionBarSource).toContain('hover:bg-muted');
    expect(batchActionBarSource).not.toContain('bg-white');
  });
});
