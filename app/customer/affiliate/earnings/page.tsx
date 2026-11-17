"use client";

import { useEffect, useState } from "react";
import { BackLink } from "@/components/shared/back-link";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth";
import { CustomerPageHeader, CustomerPageShell } from "@/components/customer/customer-page-shell";
import { AffiliateEarningsHistory } from "@/components/customer/affiliate-earnings-history";
import { EmptyState } from "@/components/shared/empty-state";
import type { AffiliateCommission } from "@/lib/affiliate/stats";

// Every affiliate commission, reached from "View all earnings" on /customer/affiliate.
export default function AffiliateEarningsPage() {
  const { t: tCustomer } = useTranslation("customer");
  const { currentUser, loading: authLoading } = useAuth();
  const [commissions, setCommissions] = useState<AffiliateCommission[] | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      const timeoutId = window.setTimeout(() => setCommissions(null), 0);
      return () => window.clearTimeout(timeoutId);
    }
    let cancelled = false;
    fetch("/api/affiliate/stats")
      .then(async (res) => (res.ok ? ((await res.json()) as { data: { commissions: AffiliateCommission[] } | null }).data?.commissions ?? null : null))
      .catch(() => null)
      .then((result) => {
        if (!cancelled) setCommissions(result);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, currentUser]);

  return (
    <CustomerPageShell wide>
      <BackLink fallbackHref="/customer/affiliate" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} aria-hidden="true" /> {tCustomer("actions.back", { ns: "common" })}
      </BackLink>
      <CustomerPageHeader title={tCustomer("strictMigration.affiliate.earnings.allTitle")} description={tCustomer("strictMigration.affiliate.earnings.allDescription")} />
      {commissions === undefined ? (
        <div className="py-8 text-sm text-muted-foreground">{tCustomer("ui.affiliate.loadingDashboard")}</div>
      ) : commissions === null ? (
        <EmptyState
          title={currentUser ? tCustomer("ui.states.noStats") : tCustomer("strictMigration.affiliate.signInRequired")}
          description={currentUser ? tCustomer("strictMigration.affiliate.loadFailed") : tCustomer("strictMigration.affiliate.signInDescription")}
        />
      ) : (
        <AffiliateEarningsHistory commissions={commissions} returnPath="/customer/affiliate/earnings" />
      )}
    </CustomerPageShell>
  );
}
