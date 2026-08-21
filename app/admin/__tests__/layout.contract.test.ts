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

  it('provides a localized label for the staff conduct navigation item', () => {
    expect(layoutSource).toContain('label: "Staff Conduct"');
    expect(readFileSync(resolve(process.cwd(), 'app/i18n/locales/en/admin.json'), 'utf8')).toContain('"Staff Conduct": "Staff Conduct"');
    expect(readFileSync(resolve(process.cwd(), 'app/i18n/locales/zh-CN/admin.json'), 'utf8')).toContain('"Staff Conduct": "员工行为"');
    expect(readFileSync(resolve(process.cwd(), 'app/i18n/locales/ms/admin.json'), 'utf8')).toContain('"Staff Conduct": "Kelakuan kakitangan"');
  });

  it('uses a real sign-out action in the sticky toolbar', () => {
    expect(layoutSource).toContain('await supabase.auth.signOut();');
    expect(layoutSource).toContain('tCommon("actions.signOut")');
    expect(layoutSource).toMatch(/<header className="sticky top-0 z-40[\s\S]*?<button[\s\S]*?aria-label={tCommon\("actions\.signOut"\)}/);
    expect(layoutSource).not.toContain('> Switch account</Link>');
  });

  it('polls one shared queue-count endpoint and renders the same pending badge for review nav items', () => {
    expect(layoutSource).toContain('/api/admin/navigation/counts');
    expect(layoutSource).toContain('pendingCountFor');
    expect(layoutSource).toContain('accessibility.pendingItems');
    expect(layoutSource).toContain('pendingCounts.catalogue');
    expect(layoutSource).toContain('pendingCounts.withdrawals');
    expect(layoutSource).toContain('pendingCounts.chatReports');
  });

  it('keeps the sidebar separators subtle and leaves the toolbar visually open', () => {
    expect(layoutSource).toContain('className="flex h-16 items-center gap-2.5 border-b border-gray-700 px-5"');
    expect(layoutSource).toContain('className="px-4 py-3 border-b border-gray-700"');
    expect(layoutSource).toContain('className="sticky top-0 z-40 flex h-16 items-center justify-end gap-2 bg-background/95 px-4 backdrop-blur-md sm:px-6"');
    expect(layoutSource).not.toContain('border-b-2 border-gray-200');
  });
});
