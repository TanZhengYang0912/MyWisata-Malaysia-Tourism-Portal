"use client";

import { useMemo, useState, type FocusEventHandler, type KeyboardEventHandler } from "react";
import { useTranslation } from "react-i18next";
import { AsYouType } from "libphonenumber-js";
import {
  defaultCountries,
  FlagImage,
  parseCountry,
  usePhoneInput,
} from "react-international-phone";
import "react-international-phone/style.css";

interface InternationalPhoneInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
  ariaDescribedBy?: string;
  autoFocus?: boolean;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
}

export function InternationalPhoneInput({
  id,
  value,
  onChange,
  disabled,
  error,
  ariaDescribedBy,
  autoFocus,
  onBlur,
  onKeyDown,
}: InternationalPhoneInputProps) {
  const { t } = useTranslation("customer");
  const [countrySearch, setCountrySearch] = useState("");
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const countries = useMemo(() => defaultCountries.map(parseCountry), []);
  const matchingCountries = useMemo(() => {
    const query = countrySearch.trim().toLowerCase();
    if (!query) return countries;

    return countries.filter((candidate) => (
      candidate.name.toLowerCase().includes(query)
      || candidate.iso2.toLowerCase().includes(query)
      || candidate.dialCode.includes(query.replace(/^\+/, ""))
    ));
  }, [countries, countrySearch]);
  const {
    country,
    handlePhoneValueChange,
    inputValue,
    setCountry,
  } = usePhoneInput({
    defaultCountry: "my",
    value,
    disableFormatting: true,
    allowMaskOverflow: true,
    disableDialCodeAndPrefix: true,
    onChange: ({ phone }) => onChange(phone),
  });
  const formattedInputValue = useMemo(() => {
    const nationalDigits = inputValue.replace(/\D/g, "");
    if (!nationalDigits) return inputValue;

    const dialCode = `+${country.dialCode}`;
    const formattedInternationalNumber = new AsYouType().input(`${dialCode}${nationalDigits}`);

    return formattedInternationalNumber.startsWith(dialCode)
      ? formattedInternationalNumber.slice(dialCode.length).trimStart()
      : inputValue;
  }, [country.dialCode, inputValue]);

  return (
    <div className="relative flex w-full overflow-visible rounded-xl border border-border bg-background text-foreground focus-within:ring-2 focus-within:ring-primary/30">
      <button
        type="button"
        className="flex shrink-0 items-center gap-2 border-r border-border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => setCountryMenuOpen((open) => !open)}
        disabled={disabled}
        aria-label={t("ui.phone.selectCountry")}
        aria-expanded={countryMenuOpen}
      >
        <FlagImage iso2={country.iso2} size="18px" />
        <span>+{country.dialCode}</span>
      </button>
      <input
        id={id}
        name={id}
        type="tel"
        value={formattedInputValue}
        onChange={handlePhoneValueChange}
        disabled={disabled}
        autoComplete="tel"
        autoFocus={autoFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        aria-invalid={error || undefined}
        aria-describedby={ariaDescribedBy}
        className="min-w-0 flex-1 rounded-r-xl bg-transparent px-3 py-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60"
      />
      {countryMenuOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="border-b border-border p-2">
            <input
              value={countrySearch}
              onChange={(event) => setCountrySearch(event.target.value)}
              placeholder={t("ui.phone.searchCountry")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1" aria-label={t("ui.phone.countries")}>
            {matchingCountries.map((candidate) => (
              <li key={`${candidate.iso2}-${candidate.dialCode}`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-secondary"
                  onClick={() => {
                    setCountry(candidate.iso2, { focusOnInput: true });
                    setCountrySearch("");
                    setCountryMenuOpen(false);
                  }}
                >
                  <FlagImage iso2={candidate.iso2} size="18px" />
                  <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                  <span className="text-muted-foreground">+{candidate.dialCode}</span>
                </button>
              </li>
            ))}
            {matchingCountries.length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-muted-foreground">{t("ui.phone.noMatch")}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
