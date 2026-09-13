"use client";

import { useSearchParams } from "next/navigation";
import OrdersPage from "@/app/customer/orders/page";
import CustomerCalendarPage from "@/app/customer/calendar/page";
import { isActivityHistory, parseActivityTab } from "@/lib/customer/activity-navigation";

export default function CustomerActivityPage() {
  const searchParams = useSearchParams();
  const tab = parseActivityTab(searchParams.get("tab"));
  const history = isActivityHistory(searchParams.get("history"));

  return (
    <div className="min-h-full bg-background">
      {tab === "orders" ? <OrdersPage /> : <CustomerCalendarPage key={history ? "history" : "upcoming"} />}
    </div>
  );
}
