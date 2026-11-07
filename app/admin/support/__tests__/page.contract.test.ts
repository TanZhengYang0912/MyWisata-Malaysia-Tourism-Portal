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
    expect(pageSource).toContain('<Pagination ariaLabel={t("ui.support.pagination")} currentPage={ticketPage} totalPages={totalTicketPages} totalItems={sortedTickets.length} pageSize={TICKETS_PER_PAGE} onPageChange={setTicketPage}');
  });

  it('resets to the first page when queue filters or sorting change', () => {
    expect(pageSource).toContain('setAssignedToMeFilter(e.target.checked); setTicketPage(1);');
    expect(pageSource).toContain('setUnreadOnlyFilter(e.target.checked); setTicketPage(1);');
    expect(pageSource).toContain('setSortKey(e.target.value as SortKey); setTicketPage(1);');
    expect(pageSource).toContain('setCategoryFilter(value); setTicketPage(1);');
    expect(pageSource).toContain('setStatusFilter(value); setTicketPage(1);');
  });
});
