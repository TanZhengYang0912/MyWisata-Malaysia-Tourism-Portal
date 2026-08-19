import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(process.cwd(), 'app/admin/recommendations/page.tsx'),
  'utf8',
);

describe('recommendation moderation pagination', () => {
  it('limits the pending queue to ten recommendations per page', () => {
    expect(pageSource).toContain('const PENDING_PAGE_SIZE = 10;');
    expect(pageSource).toContain('const visiblePending = pending.slice(');
    expect(pageSource).toContain('aria-label={t("ui.recommendations.pendingPagination")}');
    expect(pageSource).toContain('aria-label={t("ui.pagination.previousPage")}');
    expect(pageSource).toContain('aria-label={t("ui.pagination.nextPage")}');
  });

  it('gives the reviewed queue its own count and ten-item pagination', () => {
    expect(pageSource).toContain('t("ui.recommendations.reviewed", { count: reviewed.length })');
    expect(pageSource).toContain('const visibleReviewed = reviewed.slice(');
    expect(pageSource).toContain('aria-label={t("ui.recommendations.reviewedPagination")}');
    expect(pageSource).toContain('aria-label={t("ui.pagination.previousPage")}');
    expect(pageSource).toContain('aria-label={t("ui.pagination.nextPage")}');
    expect(pageSource).toContain('kind: t("ui.recommendations.reviewedLabel")');
  });
});
