"use client";

import { useTranslation } from "react-i18next";
import { CityAutocomplete } from "@/components/profile/city-autocomplete";
import { CountryCombobox } from "@/components/profile/country-combobox";
import { findCountryCode, getCanonicalCountryName } from "@/lib/location/countries";
import type { ProfileLocationValue } from "@/lib/location/city-types";

type ProfileLocationFieldsProps = {
  value: ProfileLocationValue;
  onChange: (value: ProfileLocationValue) => void;
  error?: boolean;
  disabled?: boolean;
  compact?: boolean;
};

export function ProfileLocationFields({ value, onChange, error = false, disabled = false, compact = false }: ProfileLocationFieldsProps) {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en";
  const resolvedCountryCode = value.countryCode ?? findCountryCode(value.country, locale);

  return (
    <div className={compact ? "grid gap-3 sm:grid-cols-2" : "space-y-4"}>
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tCustomer("ui.profileWizard.country")}</label>
        <CountryCombobox
          valueCode={resolvedCountryCode}
          valueLabel={value.country}
          error={error}
          disabled={disabled}
          onSelect={(option) => onChange({
            city: "",
            country: getCanonicalCountryName(option.code),
            cityId: null,
            countryCode: option.code,
          })}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tCustomer("ui.profileWizard.city")}</label>
        <CityAutocomplete
          value={value.city}
          cityId={value.cityId}
          countryCode={resolvedCountryCode}
          error={error}
          disabled={disabled}
          onChange={(city, cityId) => onChange({ ...value, city, cityId, countryCode: resolvedCountryCode })}
        />
        <p className="text-xs text-muted-foreground">{tCustomer("ui.profileLocation.cityManualHint")}</p>
      </div>
    </div>
  );
}
