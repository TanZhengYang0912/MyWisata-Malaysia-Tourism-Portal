"use client";

import { useSearchParams } from "next/navigation";
import CustomerCalendarView from "@/components/customer/customer-calendar-view";
import CustomerOrdersView from "@/components/customer/customer-orders-view";
import { isActivityHistory, parseActivityTab } from "@/lib/customer/activity-navigation";

export default function CustomerActivityPage() {
  const searchParams = useSearchParams();
  const tab = parseActivityTab(searchParams.get("tab"));
  const history = isActivityHistory(searchParams.get("history"));

  return (
    <div className="min-h-full bg-background">
      {tab === "orders" ? <CustomerOrdersView /> : <CustomerCalendarView key={history ? "history" : "upcoming"} initialScope={history ? "past" : "upcoming"} />}
    </div>
  );
}
