"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { CUSTOMER_NAV, isCustomerNavActive } from "@/lib/customer/header-navigation";

function NavigationLinks({ pathname, layout, source }: { pathname: string; layout: "single" | "stacked"; source?: string }) {
  const { t } = useTranslation("customer");
  return CUSTOMER_NAV.map((item) => {
    const active = isCustomerNavActive(pathname, item.href, source);
    return <Link
      key={item.href}
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative shrink-0 whitespace-nowrap py-1 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${layout === "single" ? "text-sm" : "text-xs"} ${active ? "font-bold text-primary" : "font-medium text-muted-foreground"}`}
    >
      {t(item.labelKey)}
      {active && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-primary" />}
    </Link>;
  });
}

function QueryNavigation({ pathname, layout }: { pathname: string; layout: "single" | "stacked" }) {
  const source = useSearchParams().get("source") ?? undefined;
  return <NavigationLinks pathname={pathname} layout={layout} source={source} />;
}

export function CustomerPrimaryNavigation({ pathname, layout }: { pathname: string; layout: "single" | "stacked" }) {
  return <Suspense fallback={<NavigationLinks pathname={pathname} layout={layout} />}>
    <QueryNavigation pathname={pathname} layout={layout} />
  </Suspense>;
}
