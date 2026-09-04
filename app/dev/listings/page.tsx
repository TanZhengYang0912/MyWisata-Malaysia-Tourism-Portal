"use client";

// DEV ONLY: lists every active listing grouped by category, for testing the
// category-specific detail pages. At the app root (not under /customer) so
// it isn't blocked by the customer role guard. Deleted at merge.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { getActivities } from "@/backend/domains/catalogue";
import { CATEGORY_DETAILS } from "@/lib/customer/category-details";
import type { Activity } from "@/backend/core/types";
import { formatMYR } from "@/lib/i18n/format";

const CATEGORY_ORDER = Object.keys(CATEGORY_DETAILS);

export default function DevListingsPage() {
  const { t } = useTranslation("auth");
  const [activities, setActivities] = useState<Activity[] | null>(null);

  useEffect(() => {
    getActivities().then(setActivities);
  }, []);

  if (activities === null) {
    return <div className="max-w-3xl mx-auto px-6 py-16 text-sm text-muted-foreground">{t("dev.loading")}</div>;
  }

  const bySlug = new Map<string, Activity[]>();
  for (const a of activities) {
    const slug = a.categorySlug ?? "uncategorised";
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug)!.push(a);
  }
  const orderedSlugs = [...CATEGORY_ORDER, ...[...bySlug.keys()].filter((s) => !CATEGORY_ORDER.includes(s))];

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-bold text-foreground mb-1">{t("dev.listings.title")}</h1>
      <p className="text-xs text-muted-foreground mb-6">
        {t("dev.listings.description", { listings: activities.length, categories: bySlug.size })}
      </p>

      <div className="space-y-6">
        {orderedSlugs.map((slug) => {
          const items = bySlug.get(slug);
          if (!items || items.length === 0) return null;
          return (
            <section key={slug}>
              <h2 className="mb-2 text-sm font-bold text-foreground">
                {items[0].category} <span className="font-normal text-muted-foreground">({items.length})</span>
              </h2>
              <div className="space-y-1.5">
                {items.map((a) => (
                  <Link
                    key={a.id}
                    href={`/customer/activity/${a.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
                  >
                    <span className="truncate">{a.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatMYR(Number(a.price))}
                      {a.isHiddenGem ? " · 💎" : ""}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
