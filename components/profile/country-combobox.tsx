"use client";

import { useId, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getCountryOptions, type CountryOption } from "@/lib/location/countries";

type CountryComboboxProps = {
  valueCode: string | null;
  valueLabel: string;
  onSelect: (option: CountryOption) => void;
  error?: boolean;
  disabled?: boolean;
};

export function CountryCombobox({ valueCode, valueLabel, onSelect, error = false, disabled = false }: CountryComboboxProps) {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const listboxId = useId();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const options = useMemo(() => getCountryOptions(locale), [locale]);
  const selected = options.find((option) => option.code === valueCode);
  const selectedLabel = selected?.label ?? valueLabel;
  const [draftQuery, setDraftQuery] = useState<string | null>(null);
  const query = draftQuery ?? selectedLabel;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const normalizedQuery = query.trim().toLocaleLowerCase(locale);
  const filtered = options.filter((option) => (
    !normalizedQuery
    || option.label.toLocaleLowerCase(locale).includes(normalizedQuery)
    || option.canonicalName.toLocaleLowerCase("en").includes(normalizedQuery.toLocaleLowerCase("en"))
    || option.code.toLocaleLowerCase("en").startsWith(normalizedQuery.toLocaleLowerCase("en"))
  )).slice(0, 12);

  function choose(option: CountryOption) {
    onSelect(option);
    setDraftQuery(null);
    setOpen(false);
    setActiveIndex(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && filtered[activeIndex]) {
      event.preventDefault();
      choose(filtered[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setDraftQuery(null);
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={open && filtered[activeIndex] ? `${listboxId}-${filtered[activeIndex].code}` : undefined}
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => { setOpen(false); setDraftQuery(null); }, 120)}
          onChange={(event) => { setDraftQuery(event.target.value); setOpen(true); setActiveIndex(0); }}
          onKeyDown={handleKeyDown}
          placeholder={tCustomer("ui.profileLocation.countrySearchPlaceholder")}
          className="w-full rounded-xl border bg-background px-3 py-2.5 pr-9 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          style={{ borderColor: error ? "var(--destructive)" : "var(--border)" }}
        />
        <ChevronDown aria-hidden size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      </div>
      {open && (
        <div id={listboxId} role="listbox" className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-border bg-popover p-1 shadow-xl">
          {filtered.length ? filtered.map((option, index) => (
            <button
              id={`${listboxId}-${option.code}`}
              key={option.code}
              type="button"
              role="option"
              aria-selected={option.code === valueCode}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${index === activeIndex ? "bg-secondary text-foreground" : "text-foreground hover:bg-secondary/70"}`}
            >
              <span><span className="font-medium">{option.label}</span><span className="ml-2 text-xs text-muted-foreground">{option.code}</span></span>
              {option.code === valueCode && <Check aria-hidden size={15} className="text-primary" />}
            </button>
          )) : (
            <p className="px-3 py-3 text-sm text-muted-foreground">{tCustomer("ui.profileLocation.countryNoResults")}</p>
          )}
        </div>
      )}
    </div>
  );
}
