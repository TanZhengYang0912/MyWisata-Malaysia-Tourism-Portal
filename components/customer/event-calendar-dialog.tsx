"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import type { DatesSetArg, EventApi, EventClickArg, EventContentArg } from "@fullcalendar/core";
import Link from "next/link";
import { CalendarDays, Clock3, MapPin, Ticket, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CustomerCalendarEvent } from "@/lib/customer/event-calendar";

const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

function formatDateTime(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale || "en-MY", {
    timeZone: MALAYSIA_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function EventCalendarDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, i18n } = useTranslation("customer");
  const locale = i18n.resolvedLanguage || i18n.language || "en-MY";
  const [events, setEvents] = useState<CustomerCalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventApi | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRange, setLastRange] = useState<string | null>(null);

  const loadEvents = useCallback(async (start: Date, end: Date) => {
    const rangeKey = `${start.toISOString()}::${end.toISOString()}`;
    if (rangeKey === lastRange) return;
    setLastRange(rangeKey);
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
      const response = await fetch(`/api/customer/event-calendar?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t("ui.home.eventCalendarLoadFailed"));
      setEvents(payload.data?.events || []);
    } catch (requestError) {
      setEvents([]);
      setError(requestError instanceof Error ? requestError.message : t("ui.home.eventCalendarLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [lastRange, t]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setSelectedEvent(null);
      setLastRange(null);
    }
    onOpenChange(nextOpen);
  }

  const selectedProps = selectedEvent?.extendedProps as CustomerCalendarEvent["extendedProps"] | undefined;
  const selectedLink = selectedProps ? `/customer/activity/${selectedProps.activityId}?outletId=${encodeURIComponent(selectedProps.outletId)}&returnTo=${encodeURIComponent("/customer")}` : "/customer";

  function renderEventContent(arg: EventContentArg) {
    const props = arg.event.extendedProps as CustomerCalendarEvent["extendedProps"];
    return <div className="mw-calendar-event-content"><span className="mw-calendar-event-time">{arg.timeText}</span><span className="mw-calendar-event-title">{arg.event.title}</span><span className="mw-calendar-event-outlet">{props.outletName}</span></div>;
  }

  function handleDatesSet(arg: DatesSetArg) {
    if (open) void loadEvents(arg.start, arg.end);
  }

  function handleEventClick(arg: EventClickArg) {
    arg.jsEvent.preventDefault();
    setSelectedEvent(arg.event);
  }

  const eventCountLabel = useMemo(() => t("ui.home.eventCalendarCount", { count: events.length }), [events.length, t]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[min(92svh,880px)] max-w-[1180px] overflow-hidden rounded-[28px] border-primary/10 bg-background p-0 shadow-2xl sm:!max-w-[1180px] sm:rounded-[32px]">
        <DialogHeader className="border-b border-border bg-card px-5 py-5 pr-14 sm:px-7 sm:py-6">
          <div className="flex items-center gap-3 text-primary"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary"><CalendarDays size={20} /></span><div><DialogTitle className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">{t("ui.home.eventCalendarTitle")}</DialogTitle><DialogDescription className="mt-1 max-w-2xl text-sm leading-6">{t("ui.home.eventCalendarDescription")}</DialogDescription></div></div>
        </DialogHeader>

        <div className="grid min-h-0 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_330px] lg:overflow-hidden">
          <section className="min-w-0 p-4 sm:p-6 lg:overflow-y-auto" aria-label={t("ui.home.eventCalendar")}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t("ui.home.planAroundYourDay")}</p><p className="mt-1 text-sm text-muted-foreground">{loading ? t("ui.home.eventCalendarLoading") : eventCountLabel}</p></div>
              {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
            </div>
            <div className="mw-customer-calendar rounded-2xl border border-border bg-card p-2 shadow-sm sm:p-4">
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
                initialView="dayGridMonth"
                timeZone={MALAYSIA_TIME_ZONE}
                events={events}
                datesSet={handleDatesSet}
                eventClick={handleEventClick}
                eventContent={renderEventContent}
                height="auto"
                contentHeight="auto"
                dayMaxEvents={3}
                nowIndicator
                slotDuration="01:00:00"
                slotLabelFormat={{ hour: "numeric", minute: "2-digit", hour12: true }}
                allDaySlot={false}
                buttonText={{ today: t("ui.home.today"), month: t("ui.home.month"), week: t("ui.home.week"), day: t("ui.home.day"), list: t("ui.home.agenda") }}
                headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,listMonth" }}
                noEventsText={t("ui.home.noEvents")}
                eventDisplay="block"
                displayEventTime
                selectable={false}
                editable={false}
              />
            </div>
            {!loading && !error && events.length === 0 && (
              <div role="status" className="mt-4 flex items-start gap-3 rounded-2xl border border-dashed border-border bg-muted/40 px-4 py-4 text-sm">
                <CalendarDays size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-foreground">{t("ui.home.noEvents")}</p>
                  <p className="mt-1 leading-6 text-muted-foreground">{t("ui.home.eventCalendarEmptyDescription")}</p>
                </div>
              </div>
            )}
          </section>

          <aside className="border-t border-border bg-card/70 p-5 sm:p-6 lg:border-l lg:border-t-0 lg:overflow-y-auto" aria-live="polite">
            {selectedEvent && selectedProps ? (
              <article className="sticky top-0">
                <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t("ui.home.selectedEvent")}</p><h2 className="mt-2 text-xl font-bold leading-tight text-foreground">{selectedEvent.title}</h2></div><button type="button" onClick={() => setSelectedEvent(null)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-secondary" aria-label={t("ui.home.closeEventDetails")}><X size={15} /></button></div>
                <div className="mt-5 space-y-3 text-sm"><div className="flex gap-3"><Clock3 size={17} className="mt-0.5 shrink-0 text-primary" /><span>{formatDateTime(selectedEvent.startStr, locale)}</span></div><div className="flex gap-3"><MapPin size={17} className="mt-0.5 shrink-0 text-primary" /><span>{selectedProps.outletName}</span></div><div className="flex gap-3"><Ticket size={17} className="mt-0.5 shrink-0 text-primary" /><span>{t("ui.home.spotsRemaining", { count: selectedProps.remainingCapacity })}</span></div></div>
                <Link href={selectedLink} onClick={() => onOpenChange(false)} className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-4 py-3 text-sm font-bold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">{t(selectedProps.requiresBooking ? "ui.actions.bookNow" : "ui.actions.viewDetails")}</Link>
              </article>
            ) : (
              <div className="flex min-h-44 flex-col justify-center"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t("ui.home.chooseAnEvent")}</p><h2 className="mt-2 text-xl font-bold text-foreground">{t("ui.home.eventCalendarAsideTitle")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("ui.home.eventCalendarAsideDescription")}</p></div>
            )}
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
