"use client";

import { useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CountryCombobox } from "@/components/profile/country-combobox";
import { InternationalPhoneInput } from "@/components/profile/international-phone-input";
import { getCountryOptions } from "@/lib/location/countries";
import { getMalaysiaDateInputValue } from "@/lib/datetime/date-input";
import { TRAVEL_GENDERS, TRAVEL_RELATIONSHIPS, type PersonalTravelDetails } from "@/lib/profile/travel-details";

export type TravelDetailsDraft = PersonalTravelDetails & { contactPhone: string | null; relationship: string | null };
export function TravelDetailsFields({ value, onChange, traveller = false, disabled = false, fieldErrors = {} }: {
  value: TravelDetailsDraft; onChange: (value: TravelDetailsDraft) => void; traveller?: boolean; disabled?: boolean; fieldErrors?: Record<string, string>;
}) {
  const { t, i18n } = useTranslation("customer");
  const id = useId();
  const dateInput = useRef<HTMLInputElement>(null);
  const countryLabel = getCountryOptions(i18n.resolvedLanguage ?? i18n.language).find((country) => country.code === value.nationalityCode)?.label ?? "";
  function error(field: string) { return fieldErrors[field] ? <p id={`${id}-${field}-error`} role="alert" className="text-sm text-destructive">{t(fieldErrors[field])}</p> : null; }
  function relationSelect(field: string, selected: string | null, onSelect: (next: string | null) => void) {
    const legacy = selected && !TRAVEL_RELATIONSHIPS.includes(selected as typeof TRAVEL_RELATIONSHIPS[number]) ? selected : null;
    return <div className="space-y-2"><Select value={selected ?? ""} onValueChange={(next) => onSelect(next || null)} disabled={disabled}><SelectTrigger id={`${id}-${field}`} className="cursor-pointer" aria-invalid={Boolean(fieldErrors[field])}><SelectValue placeholder={t("ui.travelDetails.notSet")} /></SelectTrigger><SelectContent>{TRAVEL_RELATIONSHIPS.map((option) => <SelectItem key={option} value={option}>{t(`ui.travelDetails.relationships.${option}`)}</SelectItem>)}{legacy && <SelectItem value={legacy}>{t("ui.travelDetails.legacyRelationship", { value: legacy })}</SelectItem>}</SelectContent></Select>{error(field)}</div>;
  }
  return (
    <fieldset disabled={disabled} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${id}-name`}>{t("ui.travelDetails.legalName")}</Label>
        <Input id={`${id}-name`} value={value.legalName ?? ""} minLength={2} maxLength={100} required={traveller} onChange={(event) => onChange({ ...value, legalName: event.target.value || null })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor={`${id}-dob`}>{t("ui.travelDetails.dateOfBirth")}</Label><Input ref={dateInput} id={`${id}-dob`} type="date" min="1900-01-01" max={getMalaysiaDateInputValue()} value={value.dateOfBirth ?? ""} aria-invalid={Boolean(fieldErrors.dateOfBirth)} aria-describedby={fieldErrors.dateOfBirth ? `${id}-dateOfBirth-error` : undefined} className="cursor-pointer" onClick={() => { const input = dateInput.current; if (!input || typeof input.showPicker !== "function") return; try { input.showPicker(); } catch { /* Native click behavior remains the fallback when the picker is already open. */ } }} onChange={(event) => onChange({ ...value, dateOfBirth: event.target.value || null })} />{error("dateOfBirth")}</div>
        <div className="space-y-2"><Label htmlFor={`${id}-gender`}>{t("ui.travelDetails.gender")}</Label><Select value={value.gender ?? ""} onValueChange={(gender) => onChange({ ...value, gender: (gender || null) as PersonalTravelDetails["gender"] })} disabled={disabled}><SelectTrigger id={`${id}-gender`} className="cursor-pointer" aria-invalid={Boolean(fieldErrors.gender)}><SelectValue placeholder={t("ui.travelDetails.notSet")} /></SelectTrigger><SelectContent>{TRAVEL_GENDERS.map((gender) => <SelectItem key={gender} value={gender}>{t(`ui.travelDetails.genders.${gender}`)}</SelectItem>)}</SelectContent></Select>{error("gender")}</div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-nationality`} className="cursor-pointer">{t("ui.travelDetails.nationality")}</Label>
        <CountryCombobox id={`${id}-nationality`} ariaLabel={t("ui.travelDetails.nationality")} placeholder={t("ui.travelDetails.nationalityPlaceholder")} disabled={disabled} valueCode={value.nationalityCode} valueLabel={countryLabel} onSelect={(country) => onChange({ ...value, nationalityCode: country.code })} />
        {value.nationalityCode && <div className="flex justify-end"><Button type="button" size="sm" variant="ghost" onClick={() => onChange({ ...value, nationalityCode: null })}>{t("ui.travelDetails.clearNationality")}</Button></div>}
      </div>
      {traveller && <>
        <div className="space-y-2"><Label htmlFor={`${id}-relationship`}>{t("ui.travelDetails.relationship")}</Label>{relationSelect("relationship", value.relationship, (relationship) => onChange({ ...value, relationship }))}</div>
        <div className="flex items-center gap-2"><Checkbox id={`${id}-add-phone`} className="cursor-pointer" disabled={disabled} checked={value.contactPhone !== null} onCheckedChange={(checked) => onChange({ ...value, contactPhone: checked ? "" : null })} /><Label className="cursor-pointer" htmlFor={`${id}-add-phone`}>{t("ui.travelDetails.addPhone")}</Label></div>
        {value.contactPhone !== null && <div className="space-y-2"><Label htmlFor={`${id}-phone`}>{t("ui.travelDetails.phone")}</Label><InternationalPhoneInput id={`${id}-phone`} disabled={disabled} value={value.contactPhone} error={Boolean(fieldErrors.contactPhone)} ariaDescribedBy={fieldErrors.contactPhone ? `${id}-contactPhone-error` : undefined} onChange={(phone) => onChange({ ...value, contactPhone: phone })} />{error("contactPhone")}</div>}
      </>}
      <div className="flex items-center gap-2"><Checkbox id={`${id}-emergency`} className="cursor-pointer" disabled={disabled} checked={value.emergencyContact !== null} onCheckedChange={(checked) => onChange({ ...value, emergencyContact: checked ? { name: "", relationship: null, phone: "" } : null })} /><Label className="cursor-pointer" htmlFor={`${id}-emergency`}>{t("ui.travelDetails.addEmergency")}</Label></div>
      {value.emergencyContact && <div className="space-y-4 rounded-xl border border-border p-4">
        <div className="space-y-2"><Label htmlFor={`${id}-emergency-name`}>{t("ui.travelDetails.emergencyName")}</Label><Input id={`${id}-emergency-name`} required minLength={2} maxLength={100} value={value.emergencyContact.name} aria-invalid={Boolean(fieldErrors["emergencyContact.name"])} aria-describedby={fieldErrors["emergencyContact.name"] ? `${id}-emergencyContact.name-error` : undefined} onChange={(event) => onChange({ ...value, emergencyContact: { ...value.emergencyContact!, name: event.target.value } })} />{error("emergencyContact.name")}</div>
        <div className="space-y-2"><Label htmlFor={`${id}-emergencyContact.relationship`}>{t("ui.travelDetails.emergencyRelationship")}</Label>{relationSelect("emergencyContact.relationship", value.emergencyContact.relationship, (relationship) => onChange({ ...value, emergencyContact: { ...value.emergencyContact!, relationship } }))}</div>
        <div className="space-y-2"><Label htmlFor={`${id}-emergency-phone`}>{t("ui.travelDetails.emergencyPhone")}</Label><InternationalPhoneInput id={`${id}-emergency-phone`} disabled={disabled} value={value.emergencyContact.phone} error={Boolean(fieldErrors["emergencyContact.phone"])} ariaDescribedBy={fieldErrors["emergencyContact.phone"] ? `${id}-emergencyContact.phone-error` : undefined} onChange={(phone) => onChange({ ...value, emergencyContact: { ...value.emergencyContact!, phone } })} />{error("emergencyContact.phone")}</div>
      </div>}
    </fieldset>
  );
}

export function TravelDetailsSummary({ value, contactPhone, relationship, traveller = false }: { value: PersonalTravelDetails; contactPhone?: string | null; relationship?: string | null; traveller?: boolean }) {
  const { t, i18n } = useTranslation("customer");
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const country = getCountryOptions(locale).find((option) => option.code === value.nationalityCode)?.label;
  const relationshipLabel = (value: string) => TRAVEL_RELATIONSHIPS.includes(value as typeof TRAVEL_RELATIONSHIPS[number])
    ? t(`ui.travelDetails.relationships.${value}`)
    : value;
  const items = [
    [t("ui.travelDetails.legalName"), value.legalName],
    [t("ui.travelDetails.dateOfBirth"), value.dateOfBirth ? new Intl.DateTimeFormat(locale, { timeZone: "UTC" }).format(new Date(`${value.dateOfBirth}T00:00:00Z`)) : null],
    [t("ui.travelDetails.gender"), value.gender ? t(`ui.travelDetails.genders.${value.gender}`) : null],
    [t("ui.travelDetails.nationality"), country],
    [t("ui.travelDetails.emergencyName"), value.emergencyContact ? `${value.emergencyContact.name}${value.emergencyContact.relationship ? ` · ${relationshipLabel(value.emergencyContact.relationship)}` : ""} · ${value.emergencyContact.phone}` : null],
    ...(traveller ? [[t("ui.travelDetails.phone"), contactPhone], [t("ui.travelDetails.relationship"), relationship ? relationshipLabel(relationship) : null]] : []),
  ].filter(([, content]) => content);
  return items.length ? <dl className="grid gap-3 text-sm sm:grid-cols-2">{items.map(([label, content]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words font-medium">{content}</dd></div>)}</dl> : <p className="text-sm text-muted-foreground">{t("ui.travelDetails.noPersonalDetails")}</p>;
}
