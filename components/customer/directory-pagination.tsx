"use client";

// Moved out of app/customer/search/search-client.tsx, where it was defined but
// never rendered. Colours are the original author's hard-coded values — kept
// verbatim on the move. See
// docs/plans/2026-08-13-0044-place-page-nearby-refinements.md D4.
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type PageItem = number | "ellipsis";

export function getPageItems(currentPage: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const orderedPages = [...pages].filter((page) => page > 0 && page <= totalPages).sort((a, b) => a - b);
  const items: PageItem[] = [];
  orderedPages.forEach((page, index) => {
    if (index > 0 && page - orderedPages[index - 1] > 1) items.push("ellipsis");
    items.push(page);
  });
  return items;
}

export function DirectoryPagination({
  ariaLabel,
  currentPage,
  itemLabel,
  nextPageLabel,
  onPageChange,
  pageSize,
  previousPageLabel,
  totalItems,
  totalPages,
  variant = "default",
}: {
  ariaLabel: string;
  currentPage: number;
  itemLabel: string;
  nextPageLabel?: string;
  onPageChange: (page: number) => void;
  pageSize: number;
  previousPageLabel?: string;
  totalItems: number;
  totalPages: number;
  variant?: "default" | "compact";
}) {
  const { t } = useTranslation("customer");
  if (totalPages <= 1) return null;
  if (variant === "compact") {
    return (
      <nav aria-label={ariaLabel} data-pagination-variant="compact" className="flex shrink-0 items-center justify-between border-t border-border bg-card px-3 py-2.5">
        <p aria-live="polite" className="text-[11px] font-semibold text-muted-foreground">
          {t("ui.pagination.pageOf", { current: currentPage, total: totalPages })}
        </p>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label={previousPageLabel ?? t("ui.pagination.previousPage", { item: itemLabel })} className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-primary disabled:cursor-not-allowed disabled:opacity-35"><ChevronLeft size={14} /></button>
          <button type="button" onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} aria-label={nextPageLabel ?? t("ui.pagination.nextPage", { item: itemLabel })} className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-primary disabled:cursor-not-allowed disabled:opacity-35"><ChevronRight size={14} /></button>
        </div>
      </nav>
    );
  }
  const pageItems = getPageItems(currentPage, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, totalItems);

  return (
    <nav aria-label={ariaLabel} className="mt-8 flex flex-col gap-4 border-t border-[#d7ddd9] pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-[#6d7e83]">
        {t("ui.pagination.showing", { from: pageStart + 1, to: pageEnd, total: totalItems, items: itemLabel })}
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label={previousPageLabel ?? t("ui.pagination.previousPage", { item: itemLabel })} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cad5d1] text-[#010066] disabled:cursor-not-allowed disabled:opacity-35"><ChevronLeft size={15} /></button>
        {pageItems.map((item, index) => item === "ellipsis" ? <span key={`ellipsis-${index}`} className="flex h-9 w-6 items-center justify-center text-xs text-[#6d7e83]">…</span> : <button key={item} type="button" onClick={() => onPageChange(item)} aria-current={currentPage === item ? "page" : undefined} className={`h-9 min-w-9 rounded-full px-2 text-xs font-bold ${currentPage === item ? "bg-[#010066] text-white" : "border border-[#cad5d1] text-[#6d7e83] hover:border-[#010066] hover:text-[#010066]"}`}>{item}</button>)}
        <button type="button" onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} aria-label={nextPageLabel ?? t("ui.pagination.nextPage", { item: itemLabel })} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cad5d1] text-[#010066] disabled:cursor-not-allowed disabled:opacity-35"><ChevronRight size={15} /></button>
      </div>
    </nav>
  );
}
