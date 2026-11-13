"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, type LucideIcon } from "lucide-react";
import { cn } from "@/components/utils";

// Returns the page to go to, or null when the typed value is not an integer in 1…totalPages.
export function resolvePageInput(raw: string, totalPages: number): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const page = Number(trimmed);
  return page >= 1 && page <= totalPages ? page : null;
}

export function getPageRange(currentPage: number, pageSize: number, totalItems: number) {
  const from = (currentPage - 1) * pageSize + 1;
  return { from, to: Math.min(currentPage * pageSize, totalItems) };
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
  showSummary?: boolean;
  disabled?: boolean;
  className?: string;
  /** Keyset (cursor) lists can only step one page back or forward: ‹ 2 / 5 › with no « », and the page number is not editable. */
  stepOnly?: boolean;
}

// Editorial pager: « ‹ 3 / 20 › ». See docs/coding-standards.md → "Editorial control style".
export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  ariaLabel,
  showSummary = true,
  disabled = false,
  className,
  stepOnly = false,
}: PaginationProps) {
  const { t } = useTranslation("common");
  const safeTotalPages = Math.max(1, totalPages);
  const page = Math.min(Math.max(1, currentPage), safeTotalPages);
  const [draft, setDraft] = useState(String(page));
  const [invalid, setInvalid] = useState(false);
  const [syncedPage, setSyncedPage] = useState(page);
  const restoreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset the editable value when the parent moves to another page.
  if (syncedPage !== page) {
    setSyncedPage(page);
    setDraft(String(page));
    setInvalid(false);
  }
  useEffect(() => () => {
    if (restoreTimer.current) clearTimeout(restoreTimer.current);
  }, []);

  if (totalItems <= 0) return null;

  const { from, to } = getPageRange(page, pageSize, totalItems);
  // Bold the "from–to" part inside the translated sentence; every locale keeps it contiguous.
  const rangeText = `${from}–${to}`;
  const summary = t("pagination.range", { from, to, total: totalItems });
  const rangeAt = summary.indexOf(rangeText);
  const go = (next: number) => {
    if (disabled || next === page || next < 1 || next > safeTotalPages) return;
    onPageChange(next);
  };
  const commit = () => {
    if (draft === String(page)) return;
    const next = resolvePageInput(draft, safeTotalPages);
    if (next === null) {
      setInvalid(true);
      if (restoreTimer.current) clearTimeout(restoreTimer.current);
      restoreTimer.current = setTimeout(() => {
        setDraft(String(page));
        setInvalid(false);
      }, 700);
      return;
    }
    go(next);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      setDraft(String(page));
      setInvalid(false);
    }
  };

  const arrow = (Icon: LucideIcon, target: number, label: string, atEdge: boolean) => (
    <button
      type="button"
      onClick={() => go(target)}
      disabled={disabled || atEdge}
      aria-label={label}
      className="inline-flex h-10 w-7 items-center justify-center text-primary transition-[color,transform] duration-150 hover:text-accent focus-visible:text-accent focus-visible:outline-none active:scale-[0.85] active:text-accent disabled:cursor-not-allowed disabled:text-primary/20 disabled:active:scale-100 sm:h-8"
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );

  return (
    <nav
      aria-label={ariaLabel ?? t("pagination.navLabel")}
      data-slot="pagination"
      className={cn("mt-[22px] flex flex-col items-center gap-1.5 sm:flex-row sm:justify-between sm:gap-3", className)}
    >
      {showSummary ? (
        <p aria-live="polite" className="text-[13px] text-muted-foreground">
          {rangeAt < 0 ? summary : (
            <>
              {summary.slice(0, rangeAt)}
              <span className="font-bold text-foreground">{rangeText}</span>
              {summary.slice(rangeAt + rangeText.length)}
            </>
          )}
        </p>
      ) : <span aria-hidden="true" />}
      {safeTotalPages > 1 && (
        <div className="inline-flex items-center">
          {!stepOnly && arrow(ChevronsLeft, 1, t("accessibility.firstPage"), page <= 1)}
          {arrow(ChevronLeft, page - 1, t("accessibility.previousPage"), page <= 1)}
          <div className="flex min-h-8 items-center gap-1 px-1 leading-none">
            <span
              className={`relative mr-0.5 whitespace-pre text-[26px] font-extrabold leading-none tabular-nums focus-within:underline focus-within:decoration-primary focus-within:decoration-2 focus-within:underline-offset-4 ${invalid ? "text-destructive" : "text-accent"}`}
            >
              {stepOnly ? page : draft || " "}
              {!stepOnly && <input
                value={draft}
                inputMode="numeric"
                disabled={disabled}
                aria-label={t("pagination.goToPage")}
                aria-invalid={invalid || undefined}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  setInvalid(false);
                  setDraft(event.target.value);
                }}
                onKeyDown={onKeyDown}
                onBlur={commit}
                className="absolute inset-0 h-full w-full border-0 bg-transparent p-0 text-left text-transparent caret-primary outline-none [font:inherit]"
              />}
            </span>
            <span aria-hidden="true" className="text-[15px] font-bold leading-none text-primary">/</span>
            <span className="text-[15px] font-bold leading-none text-primary">
              <span aria-hidden="true">{safeTotalPages}</span>
              <span className="sr-only">{t("pagination.ofTotal", { total: safeTotalPages })}</span>
            </span>
          </div>
          {arrow(ChevronRight, page + 1, t("accessibility.nextPage"), page >= safeTotalPages)}
          {!stepOnly && arrow(ChevronsRight, safeTotalPages, t("accessibility.lastPage"), page >= safeTotalPages)}
        </div>
      )}
    </nav>
  );
}
