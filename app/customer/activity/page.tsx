"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, ReceiptText } from "lucide-react";
import OrdersPage from "@/app/customer/orders/page";
import CustomerCalendarPage from "@/app/customer/calendar/page";
import { activityHref, isActivityHistory, parseActivityTab } from "@/lib/customer/activity-navigation";

export default function CustomerActivityPage() {
  const searchParams = useSearchParams();
  const tab = parseActivityTab(searchParams.get("tab"));
  const history = isActivityHistory(searchParams.get("history"));

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12">
        <header>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">My activity</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Your plans and purchases.</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Keep upcoming experiences, booking history and receipts together.</p>
        </header>

        <nav aria-label="My activity views" className="mt-7 flex flex-wrap gap-2 rounded-2xl border border-border bg-white p-2 shadow-[0_8px_24px_rgba(1,0,102,0.06)]">
          <Link href={activityHref("itinerary", history)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === "itinerary" ? "bg-primary text-white" : "text-slate-600 hover:bg-secondary hover:text-primary"}`}>
            <CalendarDays size={16} /> Upcoming itinerary
          </Link>
          <Link href={activityHref("orders")} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === "orders" ? "bg-primary text-white" : "text-slate-600 hover:bg-secondary hover:text-primary"}`}>
            <ReceiptText size={16} /> Orders & receipts
          </Link>
        </nav>
      </div>

      <div className="mt-2">
        {tab === "orders" ? <OrdersPage /> : <CustomerCalendarPage key={history ? "history" : "upcoming"} initialScope={history ? "past" : "upcoming"} />}
      </div>
    </div>
  );
}
