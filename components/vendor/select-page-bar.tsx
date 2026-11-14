"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  /** Ids shown on the current page. Selection never reaches rows on other pages. */
  pageIds: string[];
  selectedIds: string[];
  onChange: (nextSelectedIds: string[]) => void;
  label: string;
  /** Right-aligned context such as "14 orders · 10 per page". */
  summary?: ReactNode;
  disabled?: boolean;
}

/**
 * The "Select current page" strip above Vendor record tables. One treatment
 * for Orders, Bookings, Products and Vouchers: a neutral muted surface (not
 * the lavender selected-state tint), and a native checkbox that shows the
 * indeterminate state when only some rows on the page are selected.
 */
export function SelectPageBar({ pageIds, selectedIds, onChange, label, summary, disabled = false }: Props) {
  const checkboxRef = useRef<HTMLInputElement>(null);
  const selectedOnPage = pageIds.filter((id) => selectedIds.includes(id)).length;
  const isAllSelected = pageIds.length > 0 && selectedOnPage === pageIds.length;
  const isPartlySelected = selectedOnPage > 0 && !isAllSelected;

  // `indeterminate` is a DOM property only; it cannot be set through JSX.
  useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = isPartlySelected;
  }, [isPartlySelected]);

  // Same semantics the pages had before: the page selection replaces any
  // earlier selection, so a bulk action never touches rows the vendor cannot see.
  function toggle(checked: boolean) {
    onChange(checked ? [...pageIds] : []);
  }

  return (
    <div
      data-select-page-bar
      className="flex min-h-11 items-center justify-between gap-3 border-b border-border bg-muted/50 px-5 py-2.5 text-xs text-muted-foreground"
    >
      <label className={`inline-flex items-center gap-2 font-semibold text-foreground/80 ${disabled || pageIds.length === 0 ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={isAllSelected}
          aria-checked={isPartlySelected ? "mixed" : isAllSelected}
          disabled={disabled || pageIds.length === 0}
          onChange={(event) => toggle(event.target.checked)}
        />
        {label}
        {selectedOnPage > 0 && <span className="font-normal tabular-nums text-muted-foreground">({selectedOnPage}/{pageIds.length})</span>}
      </label>
      {summary && <span className="tabular-nums">{summary}</span>}
    </div>
  );
}
