"use client";

import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { CountryCombobox } from "@/components/profile/country-combobox";
import { InternationalPhoneInput } from "@/components/profile/international-phone-input";
import { getCountryOptions } from "@/lib/location/countries";
import { getMalaysiaDateInputValue } from "@/lib/datetime/date-input";
import { TRAVEL_GENDERS, type PersonalTravelDetails } from "@/lib/profile/travel-details";

export type TravelDetailsDraft = PersonalTravelDetails & { contactPhone: string | null; relationship: string | null };
export function TravelDetailsFields({ value, onChange, traveller = false, disabled = false }: {
  value: TravelDetailsDraft; onChange: (value: TravelDetailsDraft) => void; traveller?: boolean; disabled?: boolean;
}) {
  const { t, i18n } = useTranslation("customer");
  const id = useId();
  const countryLabel = getCountryOptions(i18n.resolvedLanguage ?? i18n.language).find((country) => country.code === value.nationalityCode)?.label ?? "";
  return (
    <fieldset disabled={disabled} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>{t("ui.travelDetails.legalName")}</Label>
        <Input id={`${id}-name`} value={value.legalName ?? ""} minLength={2} maxLength={100} required={traveller} onChange={(event) => onChange({ ...value, legalName: event.target.value || null })} aria-describedby={`${id}-name-hint`} />
        <p id={`${id}-name-hint`} className="text-xs text-muted-foreground">{t("ui.travelDetails.legalNameHint")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor={`${id}-dob`}>{t("ui.travelDetails.dateOfBirth")}</Label><Input id={`${id}-dob`} type="date" min="1900-01-01" max={getMalaysiaDateInputValue()} value={value.dateOfBirth ?? ""} onChange={(event) => onChange({ ...value, dateOfBirth: event.target.value || null })} /></div>
        <div className="space-y-2"><Label htmlFor={`${id}-gender`}>{t("ui.travelDetails.gender")}</Label><select id={`${id}-gender`} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={value.gender ?? ""} onChange={(event) => onChange({ ...value, gender: event.target.value as PersonalTravelDetails["gender"] || null })}><option value="">{t("ui.travelDetails.notSet")}</option>{TRAVEL_GENDERS.map((gender) => <option key={gender} value={gender}>{t(`ui.travelDetails.genders.${gender}`)}</option>)}</select></div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-nationality`}>{t("ui.travelDetails.nationality")}</Label>
        <CountryCombobox id={`${id}-nationality`} ariaLabel={t("ui.travelDetails.nationality")} placeholder={t("ui.travelDetails.nationalityPlaceholder")} disabled={disabled} valueCode={value.nationalityCode} valueLabel={countryLabel} onSelect={(country) => onChange({ ...value, nationalityCode: country.code })} />
        <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{t("ui.travelDetails.nationalityHint")}</p>{value.nationalityCode && <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...value, nationalityCode: null })}>{t("ui.travelDetails.clearNationality")}</Button>}</div>
      </div>
      {traveller && <>
        <div className="space-y-2"><Label htmlFor={`${id}-relationship`}>{t("ui.travelDetails.relationship")}</Label><Input id={`${id}-relationship`} maxLength={50} value={value.relationship ?? ""} onChange={(event) => onChange({ ...value, relationship: event.target.value || null })} /></div>
        <div className="flex items-center gap-2"><Checkbox id={`${id}-add-phone`} disabled={disabled} checked={value.contactPhone !== null} onCheckedChange={(checked) => onChange({ ...value, contactPhone: checked ? "" : null })} /><Label htmlFor={`${id}-add-phone`}>{t("ui.travelDetails.addPhone")}</Label></div>
        {value.contactPhone !== null && <div className="space-y-2"><Label htmlFor={`${id}-phone`}>{t("ui.travelDetails.phone")}</Label><InternationalPhoneInput id={`${id}-phone`} disabled={disabled} value={value.contactPhone} onChange={(phone) => onChange({ ...value, contactPhone: phone })} /></div>}
      </>}
      <div className="flex items-center gap-2"><Checkbox id={`${id}-emergency`} disabled={disabled} checked={value.emergencyContact !== null} onCheckedChange={(checked) => onChange({ ...value, emergencyContact: checked ? { name: "", relationship: null, phone: "" } : null })} /><Label htmlFor={`${id}-emergency`}>{t("ui.travelDetails.addEmergency")}</Label></div>
      {value.emergencyContact && <div className="space-y-4 rounded-xl border border-border p-4">
        <div className="space-y-2"><Label htmlFor={`${id}-emergency-name`}>{t("ui.travelDetails.emergencyName")}</Label><Input id={`${id}-emergency-name`} required minLength={2} maxLength={100} value={value.emergencyContact.name} onChange={(event) => onChange({ ...value, emergencyContact: { ...value.emergencyContact!, name: event.target.value } })} /></div>
        <div className="space-y-2"><Label htmlFor={`${id}-emergency-relationship`}>{t("ui.travelDetails.relationship")}</Label><Input id={`${id}-emergency-relationship`} maxLength={50} value={value.emergencyContact.relationship ?? ""} onChange={(event) => onChange({ ...value, emergencyContact: { ...value.emergencyContact!, relationship: event.target.value || null } })} /></div>
        <div className="space-y-2"><Label htmlFor={`${id}-emergency-phone`}>{t("ui.travelDetails.emergencyPhone")}</Label><InternationalPhoneInput id={`${id}-emergency-phone`} disabled={disabled} value={value.emergencyContact.phone} onChange={(phone) => onChange({ ...value, emergencyContact: { ...value.emergencyContact!, phone } })} /></div>
      </div>}
    </fieldset>
  );
}

export function TravelDetailsSummary({ value }: { value: PersonalTravelDetails }) {
  const { t, i18n } = useTranslation("customer");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const country = getCountryOptions(locale).find((option) => option.code === value.nationalityCode)?.label;
  const items = [
    [t("ui.travelDetails.legalName"), value.legalName],
    [t("ui.travelDetails.dateOfBirth"), value.dateOfBirth ? new Intl.DateTimeFormat(locale, { timeZone: "UTC" }).format(new Date(`${value.dateOfBirth}T00:00:00Z`)) : null],
    [t("ui.travelDetails.gender"), value.gender ? t(`ui.travelDetails.genders.${value.gender}`) : null],
    [t("ui.travelDetails.nationality"), country],
    [t("ui.travelDetails.emergencyName"), value.emergencyContact ? `${value.emergencyContact.name} · ${value.emergencyContact.phone}` : null],
  ].filter(([, content]) => content);
  return items.length ? <dl className="grid gap-3 text-sm sm:grid-cols-2">{items.map(([label, content]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{content}</dd></div>)}</dl> : <p className="text-sm text-muted-foreground">{t("ui.travelDetails.noPersonalDetails")}</p>;
}
