"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Trip } from "@/backend/domains/trips";
import { Plus, Navigation, Trash2, Calendar } from "lucide-react";
import Link from "next/link";
import { createTripAction, deleteTripAction } from "./actions";

export function TripHubClient({ initialTrips }: { initialTrips: Trip[] }) {
  const { t } = useTranslation("customer");
  const [trips, setTrips] = useState<Trip[]>(initialTrips);
  const [isCreating, setIsCreating] = useState(false);

  const handleDelete = async (tripId: string) => {
    if (!confirm(t("ui.trip.confirmDelete"))) return;
    setTrips(trips.filter((t) => t.id !== tripId));
    await deleteTripAction(tripId);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold font-[family-name:var(--font-display)] text-foreground">{t("ui.trip.title")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("ui.trip.description")}</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary/90"
        >
          <Plus size={16} /> {t("ui.trip.create")}
        </button>
      </div>

      {isCreating && (
        <form action={createTripAction} className="mb-8 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-bold">{t("ui.trip.newTitle")}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("ui.trip.name")}</label>
              <input name="name" required placeholder={t("ui.trip.namePlaceholder")} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("ui.trip.startDate")}</label>
              <input name="start_date" type="date" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-muted-foreground uppercase tracking-wider">{t("ui.trip.endDate")}</label>
              <input name="end_date" type="date" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => setIsCreating(false)} className="rounded-xl px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted">{t("ui.actions.cancel")}</button>
            <button type="submit" className="rounded-xl bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary/90">{t("ui.trip.createAndStart")}</button>
          </div>
        </form>
      )}

      {trips.length === 0 && !isCreating ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-muted/30 py-24 text-center">
          <Navigation className="mb-4 h-12 w-12 text-muted-foreground opacity-50" />
          <h3 className="text-lg font-bold text-foreground">{t("ui.trip.emptyTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("ui.trip.emptyDescription")}</p>
          <button onClick={() => setIsCreating(true)} className="mt-6 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white transition hover:bg-primary/90">
            {t("ui.trip.createFirst")}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <div key={trip.id} className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md hover:border-primary/30">
              <div>
                <h3 className="text-lg font-bold text-foreground mb-1">{trip.name}</h3>
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <Calendar size={13} />
                  {trip.start_date ? (trip.end_date ? t("ui.trip.dateRange", { start: trip.start_date, end: trip.end_date }) : trip.start_date) : t("ui.trip.datesPending")}
                </p>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <Link href={`/customer/trip/${trip.id}`} className="text-sm font-bold text-primary hover:underline">
                  {t("ui.trip.openPlanner")}
                </Link>
                <button
                  onClick={() => handleDelete(trip.id)}
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100"
                  aria-label={t("ui.trip.delete")}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
