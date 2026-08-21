import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  resolve(process.cwd(), 'components/admin/filter-bar.tsx'),
  'utf8',
);

describe('admin filter bar presentation', () => {
  it('provides a responsive card wrapper for filter controls', () => {
    expect(componentSource).toContain('rounded-2xl border border-border bg-card');
    expect(componentSource).toContain('flex flex-wrap');
    expect(componentSource).toContain('gap-3');
  });

  it('exports a shared native control class with the standard dimensions', () => {
    expect(componentSource).toContain('adminFilterControlClassName');
    expect(componentSource).toContain('h-10');
    expect(componentSource).toContain('rounded-xl');
    expect(componentSource).toContain('bg-card');
    expect(componentSource).toContain('focus:ring-2');
  });
});
