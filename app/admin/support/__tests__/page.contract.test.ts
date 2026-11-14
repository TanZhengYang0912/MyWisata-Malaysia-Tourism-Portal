import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageSource = readFileSync(
  resolve(process.cwd(), 'app/admin/support/page.tsx'),
  'utf8',
);

describe('support ticket pagination', () => {
  it('persists admin attachment references and requires a confirmed upload response', () => {
    expect(pageSource).toContain('supportAttachmentOperationStorageKey("admin"');
    expect(pageSource).toContain('saveSessionOperationId(storageKey, operationId)');
    expect(pageSource).toContain('typeof result?.data?.id !== "string"');
    expect(pageSource).toContain('uploadInFlightRef.current');
    expect(pageSource).toContain('attachmentRecoveryAnotherTicket');
    expect(pageSource).toContain('if (!pendingStorageKey || !readSessionOperationId(pendingStorageKey))');
  });

  it('requests a fixed page from the server and exposes previous/next navigation', () => {
    expect(pageSource).toContain('const TICKETS_PER_PAGE = 10;');
    expect(pageSource).toContain('page: String(ticketPage)');
    expect(pageSource).toContain('setTotalTickets(result.data.total)');
    expect(pageSource).toContain('const visibleTickets = tickets ?? [];');
    expect(pageSource).toContain('<Pagination ariaLabel={t("ui.support.pagination")} currentPage={ticketPage} totalPages={totalTicketPages} totalItems={totalTickets} pageSize={TICKETS_PER_PAGE}');
    expect(pageSource).toContain('setSelectedIds(new Set())');
  });

  it('resets to the first page when queue filters or sorting change', () => {
    expect(pageSource).toContain('setAssignedToMeFilter(e.target.checked); setTicketPage(1); setSelectedIds(new Set());');
    expect(pageSource).toContain('setUnreadOnlyFilter(e.target.checked); setTicketPage(1); setSelectedIds(new Set());');
    expect(pageSource).toContain('setSortKey(e.target.value as SortKey); setTicketPage(1); setSelectedIds(new Set());');
    expect(pageSource).toContain('setCategoryFilter(value); setTicketPage(1); setSelectedIds(new Set());');
    expect(pageSource).toContain('setStatusFilter(value); setTicketPage(1); setSelectedIds(new Set());');
    expect(pageSource).toContain('return () => controller.abort();');
    expect(pageSource).toContain('setDebouncedSearch(searchQuery.trim()), 250');
    expect(pageSource).toContain('surface: "admin", lastDisplayedReplyId: lastDisplayedReply.id');
  });

  it('keeps queue failures retryable instead of showing an empty queue', () => {
    expect(pageSource).toContain('setQueueError(error instanceof Error');
    expect(pageSource).toContain('onClick={() => void loadTickets()}');
    expect(pageSource).toContain('queueError ? null : <EmptyState');
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
