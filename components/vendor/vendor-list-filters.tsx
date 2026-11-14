"use client";

import { useId, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { DiscoveryToolbar } from "@/components/customer/discovery-filters";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface VendorListFiltersProps {
  query: string;
  onQueryChange: (query: string) => void;
  placeholder: string;
  sort?: string;
  defaultSort?: string;
  sortOptions?: { value: string; label: string }[];
  onSortChange?: (sort: string) => void;
  chips: { key: string; label: string; onRemove: () => void }[];
  onClearAll: () => void;
  drawerTitle: string;
  drawerDescription?: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onApply?: () => void;
  resultCountLabel?: string;
  /** Blocks Apply while the draft filters are invalid (for example an inverted date range). */
  applyDisabled?: boolean;
  trailing?: ReactNode;
}

export function VendorListFilters({
  query, onQueryChange, placeholder, sort, defaultSort, sortOptions, onSortChange,
  chips, onClearAll, drawerTitle, drawerDescription, children, open, onOpenChange,
  onApply, resultCountLabel, applyDisabled = false, trailing,
}: VendorListFiltersProps) {
  const { t } = useTranslation("vendor");
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open ?? internalOpen;
  const titleId = useId();
  const descriptionId = useId();
  const changeOpen = (nextOpen: boolean) => {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return (
    <Dialog open={isOpen} onOpenChange={changeOpen}>
      <div className="min-w-0">
        <DiscoveryToolbar
          query={query}
          onQueryChange={onQueryChange}
          placeholder={placeholder}
          searchLabel={placeholder}
          filterCount={chips.length}
          sort={sort}
          defaultSort={defaultSort}
          sortOptions={sortOptions}
          onSortChange={onSortChange}
          labels={{ filters: t("ui.listFilters.filters"), sortBy: t("ui.listFilters.sortBy") }}
          trailing={trailing}
        />
        {chips.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            {chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                aria-label={t("ui.listFilters.removeFilter", { label: chip.label })}
                onClick={chip.onRemove}
                className="inline-flex h-[34px] items-center gap-2 rounded-full border-[1.5px] border-primary pl-3 pr-2.5 text-[13px] font-bold text-primary transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {chip.label}
                <X size={15} aria-hidden="true" />
              </button>
            ))}
            <button type="button" onClick={onClearAll} className="px-0.5 py-1.5 text-[13px] font-bold text-primary underline underline-offset-4 hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              {t("ui.listFilters.clear")}
            </button>
          </div>
        )}
      </div>
      <DialogContent
        aria-labelledby={titleId}
        aria-describedby={drawerDescription ? descriptionId : undefined}
        // Phones get a full-height sheet; from sm up the panel sizes to its
        // content and floats beside the list, so Apply sits right under the
        // last control instead of below a tall empty drawer.
        className="fixed inset-y-0 right-0 left-auto top-0 z-50 flex h-dvh max-h-dvh w-full max-w-[430px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-y-0 border-r-0 p-0 shadow-xl duration-200 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right sm:bottom-auto sm:right-4 sm:top-4 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-[400px] sm:rounded-2xl sm:border"
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-5 pr-14">
          <DialogTitle id={titleId} className="text-primary">{drawerTitle}</DialogTitle>
          {drawerDescription && <DialogDescription id={descriptionId} className="text-sm text-muted-foreground">{drawerDescription}</DialogDescription>}
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">{children}</div>
        <div className="flex shrink-0 items-center gap-4 border-t border-border bg-background px-5 py-4">
          <button type="button" onClick={onClearAll} className="px-0.5 py-1.5 text-[13px] font-bold text-primary underline underline-offset-4 hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            {t("ui.listFilters.clear")}
          </button>
          <Button type="button" className="h-11 flex-1 rounded-xl font-bold" disabled={applyDisabled} onClick={() => onApply ? onApply() : changeOpen(false)}>
            {resultCountLabel ?? t("ui.listFilters.showResults")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
