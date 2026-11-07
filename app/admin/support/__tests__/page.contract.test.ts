import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(process.cwd(), 'app/admin/support/page.tsx'),
  'utf8',
);

describe('support ticket pagination', () => {
  it('limits the visible queue and exposes previous/next navigation', () => {
    expect(pageSource).toContain('const TICKETS_PER_PAGE = 10;');
    expect(pageSource).toContain('const visibleTickets = sortedTickets.slice(');
    expect(pageSource).toContain('aria-label={t("ui.support.pagination")}');
    expect(pageSource).toContain('aria-label={t("ui.pagination.previousPage")}');
    expect(pageSource).toContain('aria-label={t("ui.pagination.nextPage")}');
  });

  it('resets to the first page when queue filters or sorting change', () => {
    expect(pageSource).toContain('setAssignedToMeFilter(e.target.checked); setTicketPage(1);');
    expect(pageSource).toContain('setUnreadOnlyFilter(e.target.checked); setTicketPage(1);');
    expect(pageSource).toContain('setSortKey(e.target.value as SortKey); setTicketPage(1);');
    expect(pageSource).toContain('setCategoryFilter(value); setTicketPage(1);');
    expect(pageSource).toContain('setStatusFilter(value); setTicketPage(1);');
  });

  it('keeps the ticket thread and reply controls inside a scrollable phone-height dialog', () => {
    expect(pageSource).toContain('max-h-[calc(100dvh-2rem)]');
    expect(pageSource).toContain('min-h-0 flex-1 overflow-y-auto overscroll-contain');
    expect(pageSource).toContain('flex flex-col gap-2 pr-6 sm:flex-row sm:items-center sm:justify-between');
    expect(pageSource).toContain('shrink-0 border-t border-border');
  });

  it('gives phone ticket cards full-width content before labeled review controls', () => {
    expect(pageSource).toContain('AdminMobileRecordCard');
    expect(pageSource).toContain('space-y-3 p-3 lg:hidden');
    expect(pageSource).toContain('grid gap-2 sm:grid-cols-2');
    expect(pageSource).toContain('hidden divide-y divide-border lg:block');
    expect(pageSource).toContain('aria-label={t("ui.support.overrideCategory")}');
    expect(pageSource).toContain('aria-label={t("ui.support.statusLabel")}');
  });
});
