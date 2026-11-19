"use client";

import dynamic from "next/dynamic";

// The dashboard page is a Server Component, which cannot use `ssr: false`, so
// this client wrapper keeps recharts out of the dashboard's first load (as
// components/map/map-view.tsx does for maplibre). The charts need the browser's
// width anyway, so nothing useful is lost by skipping server rendering.
// Placeholders keep each chart's size so the layout does not jump.

export const LazySalesChart = dynamic(() => import("./sales-chart"), {
  ssr: false,
  loading: () => <div aria-busy="true" className="min-h-[380px]" />,
});

export const LazyOutletPieChart = dynamic(() => import("./outlet-pie-chart"), {
  ssr: false,
  loading: () => <div aria-busy="true" className="min-h-[380px] h-full rounded-2xl border border-gray-100 dark:border-border bg-card p-6 shadow-sm" />,
});
