"use client";

import { useId } from "react";

import { adminFilterControlClassName } from "@/components/admin/filter-bar";
import { Input } from "@/components/ui/input";
import { isInvalidDateTimeRange } from "@/lib/datetime/malaysia";

type AdminDateTimeRangeFieldProps = {
  startsAt: string;
  endsAt: string;
  onStartsAtChange: (value: string) => void;
  onEndsAtChange: (value: string) => void;
  startsAtLabel: string;
  endsAtLabel: string;
  timezoneLabel: string;
  invalidRangeMessage: string;
  required?: boolean;
};

export function AdminDateTimeRangeField({
  startsAt,
  endsAt,
  onStartsAtChange,
  onEndsAtChange,
  startsAtLabel,
  endsAtLabel,
  timezoneLabel,
  invalidRangeMessage,
  required = false,
}: AdminDateTimeRangeFieldProps) {
  const id = useId();
  const helpId = `${id}-timezone`;
  const errorId = `${id}-range-error`;
  const invalidRange = isInvalidDateTimeRange(startsAt, endsAt);
  const endDescription = invalidRange ? `${helpId} ${errorId}` : helpId;

  return (
    <div className="grid gap-4 md:order-last md:col-span-2 md:grid-cols-2 xl:order-none xl:col-span-2">
      <label className="text-sm font-semibold text-foreground">
        {startsAtLabel}
        <Input
          required={required}
          type="datetime-local"
          aria-label={startsAtLabel}
          aria-describedby={helpId}
          value={startsAt}
          onChange={(event) => onStartsAtChange(event.target.value)}
          className={`${adminFilterControlClassName} mt-2 w-full`}
        />
      </label>
      <label className="text-sm font-semibold text-foreground">
        {endsAtLabel}
        <Input
          required={required}
          type="datetime-local"
          aria-label={endsAtLabel}
          aria-describedby={endDescription}
          aria-invalid={invalidRange || undefined}
          min={startsAt || undefined}
          value={endsAt}
          onChange={(event) => onEndsAtChange(event.target.value)}
          className={`${adminFilterControlClassName} mt-2 w-full`}
        />
      </label>
      <div className="-mt-2 md:col-span-2">
        <p id={helpId} className="text-xs text-muted-foreground">{timezoneLabel}</p>
        {invalidRange && <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-destructive">{invalidRangeMessage}</p>}
      </div>
    </div>
  );
}
