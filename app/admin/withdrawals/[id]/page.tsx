"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { WithdrawalReviewDetail } from "@/components/admin/withdrawal-review-detail";

export default function AdminWithdrawalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation("admin");

  return (
    <AdminPageShell>
      <Link href="/admin/withdrawals" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
        <ArrowLeft size={15} /> {t("withdrawals.detail.backToQueue")}
      </Link>
      <AdminPageHeader
        eyebrow={<span className="flex items-center gap-2"><ShieldCheck size={14} /> {t("withdrawals.detail.eyebrow")}</span>}
        title={t("withdrawals.detail.reviewTitle")}
        description={t("withdrawals.detail.reviewDescription")}
      />
      <WithdrawalReviewDetail withdrawalId={id} />
    </AdminPageShell>
  );
}
