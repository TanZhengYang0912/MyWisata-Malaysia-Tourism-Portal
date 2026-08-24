import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(process.cwd(), 'app/admin/recommendations/page.tsx'),
  'utf8',
);

describe('recommendation moderation pagination', () => {
  it('requests ten recommendations per server-owned page', () => {
    expect(pageSource).toContain('const PAGE_SIZE = 10;');
    expect(pageSource).toContain('pageSize: String(PAGE_SIZE)');
    expect(pageSource).toContain('/api/admin/recommendations?');
    expect(pageSource).toContain('aria-label={t("ui.pagination.previousPage")}');
    expect(pageSource).toContain('aria-label={t("ui.pagination.nextPage")}');
  });

  it('uses the API counts and status filter instead of splitting a browser-side table', () => {
    expect(pageSource).toContain('data.counts.pending');
    expect(pageSource).toContain('data.counts.reviewed');
    expect(pageSource).toContain('<option value="reviewed">');
    expect(pageSource).not.toContain('.filter((r) => r.status');
  });
});
