"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getBookingsForUser } from "@/backend/domains/commerce";
import { EmptyState } from "@/components/shared/empty-state";
import type { Booking } from "@/backend/core/types";

export default function CustomerCalendarPage() {
  const { currentUser } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  useEffect(() => { if (currentUser) getBookingsForUser(currentUser.id).then(setBookings); }, [currentUser]);
  const grouped = useMemo(() => (bookings ?? []).reduce<Record<string, Booking[]>>((result, booking) => {
    const key = booking.slotStartsAt ? new Date(booking.slotStartsAt).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Date to be confirmed";
    (result[key] ??= []).push(booking);
    return result;
  }, {}), [bookings]);
  if (bookings === null) return <div className="max-w-3xl mx-auto px-6 py-16 text-sm text-muted-foreground">Loading…</div>;
  return <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8"><div className="flex items-center gap-3 mb-6"><CalendarDays className="text-primary" /><div><h1 className="text-2xl font-bold text-foreground">Booking calendar</h1><p className="text-sm text-muted-foreground">All confirmed activities in one place.</p></div></div>{Object.keys(grouped).length === 0 ? <EmptyState icon={<CalendarDays size={40} />} title="No bookings yet" description="Your booked activities will appear here after checkout." /> : <div className="space-y-4">{Object.entries(grouped).map(([date, items]) => <section key={date} className="rounded-xl border border-border bg-card p-4"><h2 className="font-semibold text-foreground">{date}</h2><div className="mt-3 space-y-3">{items.map((booking) => <Link key={booking.id} href={`/customer/orders/${booking.orderId}`} className="block rounded-lg bg-secondary/60 p-3 hover:bg-secondary"><p className="text-sm font-semibold text-foreground">{booking.activityName}</p><p className="mt-1 text-xs text-muted-foreground">{booking.slotStartsAt ? new Date(booking.slotStartsAt).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }) : "Time pending"} · Qty {booking.qty}</p></Link>)}</div></section>)}</div>}</div>;
}
