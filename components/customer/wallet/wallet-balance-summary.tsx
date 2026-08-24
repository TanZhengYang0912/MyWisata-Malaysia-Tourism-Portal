"use client";

import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

export type WalletBuckets = {
  topup: number;
  earnings: number;
  pendingEarnings: number;
  reservedEarnings: number;
  withdrawnEarnings: number;
};

export function WalletBalanceSummary({ buckets, onTopUp, onWithdraw }: {
  buckets: WalletBuckets | null;
  onTopUp: () => void;
  onWithdraw: () => void;
}) {
  const { t } = useTranslation("customer");
  const totalBalance = (buckets?.topup ?? 0) + (buckets?.earnings ?? 0);
  const values = [
    ["ui.wallet.topupBalance", buckets?.topup],
    ["ui.wallet.earningsBalance", buckets?.earnings],
    ["ui.wallet.pendingRewards", buckets?.pendingEarnings],
    ["ui.wallet.reservedWithdrawals", buckets?.reservedEarnings],
    ["ui.wallet.withdrawnEarnings", buckets?.withdrawnEarnings],
  ] as const;

  return <section className="mb-8 rounded-2xl bg-gradient-to-br from-[#010066] to-[#1D2A8A] p-6 text-white shadow-[0_18px_40px_rgba(1,0,102,0.16)] sm:p-7">
    <p className="mb-1 text-sm opacity-75">{t("ui.checkout.total")}</p>
    <p className="font-[family-name:var(--font-mono)] text-4xl font-bold">{buckets === null ? "—" : `RM ${totalBalance.toFixed(2)}`}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {values.map(([label, amount]) => <div key={label} className="min-h-[64px] rounded-xl bg-white/10 px-4 py-2"><p className="text-xs opacity-60">{t(label)}</p><p className="mt-0.5 font-[family-name:var(--font-mono)] text-sm font-semibold">{amount == null ? "—" : `RM ${amount.toFixed(2)}`}</p>{label === "ui.wallet.pendingRewards" && <p className="mt-1 text-[10px] leading-snug opacity-60">{t("ui.wallet.pendingRewardsHint")}</p>}</div>)}
    </div>
    <div className="mt-5 flex gap-3">
      <button type="button" onClick={onTopUp} className="flex items-center gap-2 rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/30"><ArrowUpCircle size={16} />{t("ui.wallet.topUp")}</button>
      <button type="button" onClick={onWithdraw} className="flex items-center gap-2 rounded-xl bg-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/30"><ArrowDownCircle size={16} />{t("ui.wallet.withdraw")}</button>
    </div>
  </section>;
}
