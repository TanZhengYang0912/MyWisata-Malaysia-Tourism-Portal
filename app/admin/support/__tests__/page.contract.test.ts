import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(process.cwd(), 'app/admin/support/page.tsx'),
  'utf8',
);

describe('support ticket pagination', () => {
  it('requests a fixed page from the server and exposes previous/next navigation', () => {
    expect(pageSource).toContain('const TICKETS_PER_PAGE = 10;');
    expect(pageSource).toContain('page: String(ticketPage)');
    expect(pageSource).toContain('setTotalTickets(result.data.total)');
    expect(pageSource).toContain('const visibleTickets = tickets ?? [];');
    expect(pageSource).toContain('aria-label={t("ui.support.pagination")}');
    expect(pageSource).toContain('aria-label={t("ui.pagination.previousPage")}');
    expect(pageSource).toContain('aria-label={t("ui.pagination.nextPage")}');
  });

  it('resets to the first page when queue filters or sorting change', () => {
    expect(pageSource).toContain('setAssignedToMeFilter(e.target.checked); setTicketPage(1); setSelectedIds(new Set());');
    expect(pageSource).toContain('setUnreadOnlyFilter(e.target.checked); setTicketPage(1); setSelectedIds(new Set());');
    expect(pageSource).toContain('setSortKey(e.target.value as SortKey); setTicketPage(1); setSelectedIds(new Set());');
    expect(pageSource).toContain('setCategoryFilter(value); setTicketPage(1); setSelectedIds(new Set());');
    expect(pageSource).toContain('setStatusFilter(value); setTicketPage(1); setSelectedIds(new Set());');
    expect(pageSource).toContain('return () => controller.abort();');
    expect(pageSource).toContain('setDebouncedSearch(searchQuery.trim()), 250');
  });

  it('keeps queue failures retryable instead of showing an empty queue', () => {
    expect(pageSource).toContain('setQueueError(error instanceof Error');
    expect(pageSource).toContain('onClick={() => void loadTickets()}');
    expect(pageSource).toContain('queueError ? null : <EmptyState');
  });
});
