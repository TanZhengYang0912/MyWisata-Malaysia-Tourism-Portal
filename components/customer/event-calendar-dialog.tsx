"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import luxon3Plugin from "@fullcalendar/luxon3";
import type { DatesSetArg, EventClickArg, EventContentArg } from "@fullcalendar/core";
import Link from "next/link";
import { ArrowRight, CalendarDays, ImageOff, Loader2, MapPin, RefreshCw, Ticket, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CustomerCalendarEvent } from "@/lib/customer/event-calendar";
import { getCustomerCalendarUiState, getEarliestCustomerCalendarEvent, type CustomerCalendarLoadStatus } from "@/lib/customer/event-calendar-ui-state";

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

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale || "en-MY", {
    timeZone: MALAYSIA_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function EventCalendarDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, i18n } = useTranslation("customer");
  const locale = i18n.resolvedLanguage || i18n.language || "en-MY";
  const calendarRef = useRef<FullCalendar | null>(null);
  const lastRangeRef = useRef<string | null>(null);
  const currentRangeRef = useRef<{ start: Date; end: Date } | null>(null);
  const requestIdRef = useRef(0);
  const [events, setEvents] = useState<CustomerCalendarEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<CustomerCalendarLoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [failedImage, setFailedImage] = useState<string | null>(null);

  const loadEvents = useCallback(async (start: Date, end: Date, force = false) => {
    const rangeKey = `${start.toISOString()}::${end.toISOString()}`;
    currentRangeRef.current = { start, end };
    if (!force && rangeKey === lastRangeRef.current) return;

    lastRangeRef.current = rangeKey;
    const requestId = ++requestIdRef.current;
    let nextStatus: CustomerCalendarLoadStatus = "success";
    setLoadStatus("loading");
    setError(null);
    setEvents([]);
    setSelectedEventId(null);
    try {
      const params = new URLSearchParams({ from: start.toISOString(), to: end.toISOString() });
      const response = await fetch(`/api/customer/event-calendar?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t("ui.home.eventCalendarLoadFailed"));
      if (requestId !== requestIdRef.current) return;
      const nextEvents: CustomerCalendarEvent[] = Array.isArray(payload.data?.events) ? payload.data.events : [];
      setEvents(nextEvents);
      setSelectedEventId(getEarliestCustomerCalendarEvent(nextEvents)?.id ?? null);
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return;
      setEvents([]);
      setError(requestError instanceof Error ? requestError.message : t("ui.home.eventCalendarLoadFailed"));
      nextStatus = "error";
    } finally {
      if (requestId === requestIdRef.current) setLoadStatus(nextStatus);
    }
  }, [t]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      requestIdRef.current += 1;
      lastRangeRef.current = null;
      currentRangeRef.current = null;
      setSelectedEventId(null);
      setEvents([]);
      setError(null);
      setLoadStatus("idle");
    }
    onOpenChange(nextOpen);
  }

  function retryCurrentRange() {
    const range = currentRangeRef.current;
    if (range) void loadEvents(range.start, range.end, true);
  }

  function advanceToNextRange() {
    calendarRef.current?.getApi().next();
  }

  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;
  const selectedProps = selectedEvent?.extendedProps;
  const selectedImage = selectedProps?.image?.trim() || null;
  const selectedLink = selectedProps
    ? `/customer/activity/${selectedProps.activityId}?outletId=${encodeURIComponent(selectedProps.outletId)}&returnTo=${encodeURIComponent("/customer")}`
    : "/customer";

  function renderEventContent(arg: EventContentArg) {
    const props = arg.event.extendedProps as CustomerCalendarEvent["extendedProps"];
    const isListView = arg.view.type.startsWith("list");
    const isMonthView = arg.view.type === "dayGridMonth";
    return (
      <div className="mw-calendar-event-content">
        {!isListView && !props.isAccommodation && <span className="mw-calendar-event-time">{arg.timeText}</span>}
        {props.isAccommodation && !isListView && <span className="mw-calendar-event-time">{t("ui.home.stayDate")}</span>}
        <span className="mw-calendar-event-title">{arg.event.title}</span>
        {!isMonthView && <span className="mw-calendar-event-outlet">{props.outletName}</span>}
      </div>
    );
  }

  function handleDatesSet(arg: DatesSetArg) {
    if (open) void loadEvents(arg.start, arg.end);
  }

  useEffect(() => {
    if (!open) return;
    const view = calendarRef.current?.getApi().view;
    if (view) void loadEvents(view.activeStart, view.activeEnd);
  }, [loadEvents, open]);

  useEffect(() => () => {
    requestIdRef.current += 1;
  }, []);

  function handleEventClick(arg: EventClickArg) {
    arg.jsEvent.preventDefault();
    setSelectedEventId(arg.event.id);
  }

  const eventCountLabel = useMemo(() => t("ui.home.eventCalendarCount", { count: events.length }), [events.length, t]);
  const calendarState = getCustomerCalendarUiState(loadStatus, events.length);
  const isReady = calendarState === "ready";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="grid-rows-[minmax(0,1fr)] w-[calc(100%-1rem)] min-w-0 h-[min(92svh,880px)] max-h-[min(92svh,880px)] max-w-[1180px] gap-0 overflow-hidden rounded-[28px] border-primary/10 bg-background p-0 shadow-2xl sm:w-full sm:!max-w-[1180px] sm:rounded-[32px]">
        <div className="min-h-0 min-w-0 overflow-y-auto thin-scrollbar">
          <DialogHeader className="min-w-0 border-b border-border bg-card px-5 py-5 pr-14 sm:px-7 sm:py-6">
            <div className="flex min-w-0 items-center gap-3 text-primary"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-secondary"><CalendarDays size={20} /></span><div className="min-w-0"><DialogTitle className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight sm:text-3xl">{t("ui.home.eventCalendarTitle")}</DialogTitle><DialogDescription className="mt-1 max-w-2xl text-sm leading-6">{t("ui.home.eventCalendarDescription")}</DialogDescription></div></div>
          </DialogHeader>

          <div className={`flex min-w-0 flex-col lg:grid ${isReady ? "lg:grid-cols-[minmax(0,1fr)_330px]" : "lg:grid-cols-1"}`}>
            <section className="min-w-0 shrink-0 p-4 sm:p-6" aria-label={t("ui.home.eventCalendar")}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t("ui.home.planAroundYourDay")}</p>{isReady && <p aria-live="polite" className="mt-1 text-sm text-muted-foreground">{eventCountLabel}</p>}</div>
              </div>
              <div className={`mw-customer-calendar min-w-0 rounded-2xl border border-border bg-card p-2 shadow-sm sm:p-4 ${isReady ? "" : "mw-customer-calendar--status"}`} aria-busy={calendarState === "loading"}>
                <FullCalendar
                  ref={calendarRef}
                  plugins={[luxon3Plugin, dayGridPlugin, timeGridPlugin, listPlugin]}
                  initialView="listMonth"
                  timeZone={MALAYSIA_TIME_ZONE}
                  events={events}
                  datesSet={handleDatesSet}
                  eventClick={handleEventClick}
                  eventContent={renderEventContent}
                  eventClassNames={(arg) => [
                    ...(selectedEventId === arg.event.id ? ["mw-calendar-event--selected"] : []),
                    ...(arg.event.extendedProps.isAccommodation ? ["mw-calendar-event--accommodation"] : []),
                  ]}
                  height="auto"
                  contentHeight="auto"
                  dayMaxEvents={3}
                  moreLinkClick="listDay"
                  nowIndicator
                  slotDuration="01:00:00"
                  slotLabelFormat={{ hour: "numeric", minute: "2-digit", hour12: true }}
                  allDaySlot={false}
                  buttonText={{
                    today: t("ui.home.today"),
                    month: t("ui.home.month"),
                    week: t("ui.home.week"),
                    day: t("ui.home.day"),
                    listWeek: t("ui.home.week"),
                    listMonth: t("ui.home.agenda"),
                  }}
                  headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth,listWeek,listMonth" }}
                  noEventsText={t("ui.home.noEvents")}
                  allDayText={t("ui.home.stayDate")}
                  eventDisplay="block"
                  displayEventTime
                  selectable={false}
                  editable={false}
                />
                {calendarState === "loading" && (
                  <div role="status" aria-label={t("ui.home.eventCalendarLoading")} className="flex min-h-[250px] flex-col items-center justify-center gap-4 px-4 py-8">
                    <Loader2 size={24} className="animate-spin text-primary" aria-hidden="true" />
                    <span className="sr-only">{t("ui.home.eventCalendarLoading")}</span>
                    <div className="w-full max-w-xl space-y-3" aria-hidden="true">
                      <div className="h-3 animate-pulse rounded-full bg-secondary" />
                      <div className="h-3 w-4/5 animate-pulse rounded-full bg-secondary" />
                      <div className="h-3 w-3/5 animate-pulse rounded-full bg-secondary" />
                    </div>
                  </div>
                )}
                {calendarState === "empty" && (
                <div role="status" className="flex min-h-[250px] min-w-0 flex-col items-center justify-center gap-3 rounded-xl bg-muted/35 px-5 py-8 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary"><CalendarDays size={22} aria-hidden="true" /></span>
                    <div className="w-full min-w-0 max-w-[18rem] sm:max-w-lg">
                      <h2 className="max-w-full whitespace-normal break-words text-lg font-bold text-foreground">{t("ui.home.eventCalendarEmptyTitle")}</h2>
                      <p className="mt-2 max-w-full whitespace-normal break-words text-sm leading-6 text-muted-foreground">{t("ui.home.eventCalendarEmptyDescription")}</p>
                    </div>
                    <div className="mt-1 flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row">
                      <Link href="/customer/explore" onClick={() => handleOpenChange(false)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">{t("ui.home.eventCalendarExploreAction")} <ArrowRight size={15} aria-hidden="true" /></Link>
                      <button type="button" onClick={advanceToNextRange} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">{t("ui.home.eventCalendarTryNextRange")} <ArrowRight size={15} aria-hidden="true" /></button>
                    </div>
                  </div>
                )}
                {calendarState === "error" && (
                  <div role="alert" className="flex min-h-[250px] flex-col items-center justify-center gap-3 rounded-xl bg-muted/35 px-5 py-8 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary"><RefreshCw size={21} aria-hidden="true" /></span>
                    <div className="max-w-lg">
                      <h2 className="text-lg font-bold text-foreground">{t("ui.home.eventCalendarLoadFailed")}</h2>
                      {error && <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>}
                    </div>
                    <button type="button" onClick={retryCurrentRange} className="mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">{t("ui.actions.retry")} <RefreshCw size={15} aria-hidden="true" /></button>
                  </div>
                )}
              </div>
          </section>

            {isReady && <aside className="min-h-0 border-t border-border bg-card/70 p-5 sm:p-6 lg:border-l lg:border-t-0" aria-live="polite">
              {selectedEvent && selectedProps ? (
                <article>
                  <div className="relative mb-5 aspect-[16/10] overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-secondary to-amber-100">
                    {selectedImage && selectedImage !== failedImage ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={selectedImage} alt={selectedEvent.title} onError={() => setFailedImage(selectedImage)} className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <div role="img" aria-label={t("ui.activity.imageUnavailable", { name: selectedEvent.title })} className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-primary via-indigo-800 to-cyan-900 text-white">
                        <ImageOff size={30} strokeWidth={1.5} aria-hidden="true" />
                        <span className="mt-2 text-xs font-bold">{selectedProps.outletName}</span>
                        <span className="mt-0.5 text-[10px] text-white/75">{t("ui.labels.imageUnavailable")}</span>
                      </div>
                    )}
                    {selectedImage && selectedImage !== failedImage && <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-slate-950/10 to-slate-950/15" />}
                    <button type="button" onClick={() => setSelectedEventId(null)} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm transition hover:bg-white" aria-label={t("ui.home.closeEventDetails")}><X size={15} /></button>
                    <h2 className="absolute bottom-4 left-4 right-4 text-xl font-bold leading-tight text-white drop-shadow-sm">{selectedEvent.title}</h2>
                  </div>
                  <div className="space-y-3 text-sm"><div className="flex gap-3"><CalendarDays size={17} className="mt-0.5 shrink-0 text-primary" /><span>{selectedProps.isAccommodation && <span className="font-semibold text-foreground">{t("ui.home.stayDate")}: </span>}{selectedProps.isAccommodation ? formatDate(selectedEvent.start, locale) : formatDateTime(selectedEvent.start, locale)}</span></div><div className="flex gap-3"><MapPin size={17} className="mt-0.5 shrink-0 text-primary" /><span>{selectedProps.outletName}</span></div><div className="flex gap-3"><Ticket size={17} className="mt-0.5 shrink-0 text-primary" /><span>{t("ui.home.spotsRemaining", { count: selectedProps.remainingCapacity })}</span></div></div>
                  <Link href={selectedLink} onClick={() => handleOpenChange(false)} className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-primary px-4 py-3 text-sm font-bold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">{t(selectedProps.requiresBooking ? "ui.actions.bookNow" : "ui.actions.viewDetails")}</Link>
                </article>
              ) : (
                <div className="flex min-h-44 flex-col justify-center"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t("ui.home.chooseAnEvent")}</p><h2 className="mt-2 text-xl font-bold text-foreground">{t("ui.home.eventCalendarAsideTitle")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("ui.home.eventCalendarAsideDescription")}</p></div>
              )}
            </aside>
            }
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
