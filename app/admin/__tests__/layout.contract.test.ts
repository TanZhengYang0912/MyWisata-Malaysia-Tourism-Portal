import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layoutSource = readFileSync(
  resolve(process.cwd(), 'app/admin/layout.tsx'),
  'utf8',
);

describe('admin navigation shell', () => {
  it('keeps the sidebar fixed while the navigation list can scroll independently', () => {
    expect(layoutSource).toContain('className="flex h-screen overflow-hidden"');
    expect(layoutSource).toContain('className="flex h-screen w-60 shrink-0 flex-col bg-gray-900"');
    expect(layoutSource).toContain('min-h-0 flex-1 overflow-y-auto');
    expect(layoutSource).toContain('className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"');
  });

  it('uses a real sign-out action in the fixed footer', () => {
    expect(layoutSource).toContain('await supabase.auth.signOut();');
    expect(layoutSource).toContain('Sign out');
    expect(layoutSource).toContain('<button type="button"');
    expect(layoutSource).not.toContain('> Switch account</Link>');
  });
});
