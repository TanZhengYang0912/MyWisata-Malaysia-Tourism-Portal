"use client";

// P4 — DEV ONLY: triggers the simulated-purchase → order.paid → affiliate
// commission loop without a real checkout. The server page and API both apply
// an explicit local/staging environment allowlist before exposing this tool.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { getActivities } from "@/backend/domains/catalogue";
import { useAuth } from "@/components/providers/auth";
import { Button } from "@/components/ui/button";
import type { Activity } from "@/backend/core/types";
import { MYR_CODE } from "@/lib/i18n/invariant-tokens";

export function DemoPurchaseClient() {
  const { currentUser, loading } = useAuth();
  const { t } = useTranslation("auth");
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  useEffect(() => {
    getActivities().then(setActivities);
  }, []);

  async function simulate(productId: string) {
    if (busyId) return;
    setBusyId(productId);
    setResults((resultsByProduct) => ({ ...resultsByProduct, [productId]: "" }));
    try {
      const response = await fetch("/api/dev/simulate-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const body = (await response.json()) as {
        data: { orderId: string } | null;
        error: { message: string } | null;
      };
      setResults((resultsByProduct) => ({
        ...resultsByProduct,
        [productId]:
          response.ok && body.data
            ? t("dev.simulate.orderCreated", { orderId: body.data.orderId.slice(0, 8) })
            : (body.error?.message ?? t("dev.simulate.failed")),
      }));
    } catch {
      setResults((resultsByProduct) => ({ ...resultsByProduct, [productId]: t("dev.simulate.failed") }));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto px-6 py-16 text-sm text-muted-foreground">{t("dev.loading")}</div>;
  }

  if (!currentUser) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground mb-4">{t("dev.simulate.signInRequired")}</p>
        <Link href="/login" className="text-sm font-semibold text-primary underline">
          {t("dev.goToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-bold text-foreground mb-1">{t("dev.simulate.title")}</h1>
      <p className="text-xs text-muted-foreground mb-6">
        {t("dev.simulate.description", { name: currentUser.name })}
      </p>

      {activities === null && <p className="text-sm text-muted-foreground">{t("dev.simulate.loadingActivities")}</p>}
      {activities?.length === 0 && <p className="text-sm text-muted-foreground">{t("dev.simulate.noActivities")}</p>}

      <div className="space-y-3">
        {activities?.map((activity) => (
          <div key={activity.id} className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{activity.name}</p>
              <p className="text-xs text-muted-foreground">{MYR_CODE} {activity.price}</p>
            </div>
            <div className="text-right">
              <Button size="sm" disabled={busyId === activity.id} onClick={() => simulate(activity.id)}>
                {busyId === activity.id ? t("dev.simulate.simulating") : t("dev.simulate.action")}
              </Button>
              {results[activity.id] && <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">{results[activity.id]}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
