"use client";

import { Clock3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OperatingHourWeekday, OperatingHours } from "@/backend/core/types";
import { DISPLAY_OPERATING_HOUR_WEEKDAYS, getMalaysiaTodayKey, getOperatingHoursPeriods } from "@/lib/customer/operating-hours";

function formatPeriods(hours: OperatingHours | null | undefined, day: OperatingHourWeekday, closedLabel: string, unavailableLabel: string, allDayLabel: string) {
  const schedule = hours?.[day];
  if (!schedule || schedule.closed) return closedLabel;
  const periods = getOperatingHoursPeriods(schedule);
  if (periods.length === 0) return unavailableLabel;
  if (periods.some((period) => period.open === "00:00" && period.close === "24:00")) return allDayLabel;
  return periods.map((period) => `${period.open}–${period.close}`).join(", ");
}

export function OperatingHoursSummary({ hours, currentlyOpen, compact = false }: { hours?: OperatingHours | null; currentlyOpen?: boolean; compact?: boolean }) {
  const { t } = useTranslation("customer");
  if (!hours) return null;

  const today = getMalaysiaTodayKey();
  const todayLabel = formatPeriods(hours, today, t("ui.operatingHours.closed"), t("ui.operatingHours.unavailable"), t("ui.operatingHours.allDay"));
  const statusLabel = currentlyOpen === undefined
    ? null
    : currentlyOpen ? t("ui.operatingHours.openNow") : t("ui.operatingHours.closedNow");

  return (
    <details className={compact ? "group text-xs text-muted-foreground" : "rounded-xl border border-border/70 bg-background/60 p-3 text-sm"}>
      <summary className={compact ? "grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)] items-center gap-x-1.5 gap-y-0.5 [&::-webkit-details-marker]:hidden" : "flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden"}>
        <Clock3 size={compact ? 11 : 14} aria-hidden="true" className={currentlyOpen ? "text-emerald-600" : "text-muted-foreground"} />
        <span className={compact ? "col-start-2 flex min-w-0 flex-wrap items-center gap-x-1" : "contents"}>
          <span className={`font-semibold text-foreground${compact ? " whitespace-nowrap" : ""}`}>{t("ui.labels.operatingHours")}</span>
          {statusLabel && <span className={`${currentlyOpen ? "font-semibold text-emerald-700" : "text-muted-foreground"}${compact ? " whitespace-nowrap" : ""}`}>· {statusLabel}</span>}
        </span>
        <span className="col-start-2 min-w-0 break-words whitespace-normal leading-snug">· {t(`ui.labels.days.${today}`)} {todayLabel}</span>
      </summary>
      <div className={compact ? "mt-2 space-y-1 border-t border-border/60 pt-2" : "mt-3 space-y-2 border-t border-border/60 pt-3"}>
        {DISPLAY_OPERATING_HOUR_WEEKDAYS.map((day) => (
          <div key={day} className="flex items-start justify-between gap-4">
            <span className="font-semibold text-foreground">{t(`ui.labels.days.${day}`)}</span>
            <span className="text-right text-muted-foreground">{formatPeriods(hours, day, t("ui.operatingHours.closed"), t("ui.operatingHours.unavailable"), t("ui.operatingHours.allDay"))}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
