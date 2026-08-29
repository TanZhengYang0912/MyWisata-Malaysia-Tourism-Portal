"use client";

import { AlertCircle, Building2, CheckCircle2, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CustomerPanel } from "@/components/customer/customer-page-shell";
import { Button } from "@/components/ui/button";
import type { CustomerWalletCapabilities } from "@/lib/wallet/customer-capabilities";

export type CustomerConnectStatus = "idle" | "loading" | "kyc_required" | "unlinked" | "currently_due" | "pending_verification" | "payouts_enabled" | "past_due" | "restricted" | "status_error";

export function PayoutReadiness({ readiness, connectStatus, error, busy, onSetup, onRetry }: {
  readiness: CustomerWalletCapabilities | null;
  connectStatus: CustomerConnectStatus;
  error: string;
  busy: boolean;
  onSetup: () => void;
  onRetry: () => void;
}) {
  const { t } = useTranslation("customer");
  const ready = readiness?.canWithdraw && connectStatus === "payouts_enabled";
  const warning = connectStatus === "currently_due" || connectStatus === "pending_verification";
  const failed = connectStatus === "past_due" || connectStatus === "restricted" || connectStatus === "status_error";
  const title = ready ? t("ui.wallet.bankWithdrawalsEnabled")
    : readiness?.blockerCode === "kyc_required" || connectStatus === "kyc_required" ? t("ui.wallet.completeKycFirst")
    : readiness?.blockerCode === "minimum_balance_required" ? t("ui.wallet.noAvailableEarnings")
    : connectStatus === "currently_due" ? t("ui.wallet.completePayoutDetails")
    : connectStatus === "pending_verification" ? t("ui.wallet.stripeVerificationProgress")
    : failed ? t("ui.wallet.bankWithdrawalsRestricted")
    : t("ui.wallet.setupEarningsWithdrawals");
  const description = ready ? t("ui.wallet.approvedBankDestination")
    : connectStatus === "currently_due" ? t("ui.wallet.stripeNeedsInfo")
    : connectStatus === "pending_verification" ? t("ui.wallet.stripeReviewing")
    : failed ? (error || t("ui.wallet.bankRestrictedDescription"))
    : t("ui.wallet.setupWhenWithdrawing");

  return <CustomerPanel className="mb-8"><div className="flex items-center gap-3">
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ready ? "bg-primary/15" : warning ? "bg-amber-100" : failed ? "bg-red-100" : "bg-muted"}`}>
      {ready ? <CheckCircle2 size={16} className="text-primary" /> : warning ? <Clock size={16} className="text-amber-600" /> : failed ? <AlertCircle size={16} className="text-red-600" /> : <Building2 size={16} className="text-muted-foreground" />}
    </div>
    <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground">{title}</p><p className="mt-0.5 text-xs text-muted-foreground">{description}</p>{readiness?.destinationSummary && <p className="mt-1 text-xs text-muted-foreground">{readiness.destinationSummary.displayLabel}</p>}{readiness?.lastProviderCheckAt && <p className="mt-1 text-[11px] text-muted-foreground">{new Date(readiness.lastProviderCheckAt).toLocaleString()}</p>}<p className="mt-1 text-xs text-muted-foreground">{t("ui.wallet.stripePrivacy")}</p></div>
    {(connectStatus === "unlinked" || connectStatus === "currently_due" || connectStatus === "past_due") && <Button size="sm" onClick={onSetup} disabled={busy}>{busy ? t("ui.states.loading") : t(connectStatus === "unlinked" ? "ui.wallet.setupWithdrawals" : "ui.wallet.updateDetails")}</Button>}
    {(connectStatus === "pending_verification" || connectStatus === "restricted" || connectStatus === "status_error") && <Button size="sm" variant="outline" onClick={onRetry}>{t("ui.wallet.retryStatusCheck")}</Button>}
  </div></CustomerPanel>;
}
