"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CustomerPageShell, CustomerPageTitle, CustomerPanel } from "@/components/customer/customer-page-shell";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { RecommendationEarningsPanel } from "@/components/customer/recommendation-earnings-panel";
import { ShareButton } from "@/components/shared/share-button";

type CustomerRecommendationDetail = {
  id: string;
  name: string;
  description: string | null;
  whyRecommend: string | null;
  category: string | null;
  state: string | null;
  status: string;
  submittedAt: string;
  reviewedAt: string | null;
  changesRequested: { message: string | null; createdAt: string | null } | null;
  decision: { message: string | null; createdAt: string | null } | null;
  vendor: { id: string; name: string | null; href: string } | null;
  events: Array<{ id: string; fromStatus: string; toStatus: string; action: string; message: string; createdAt: string }>;
  nextAction: "update_recommendation" | "view_vendor" | null;
};

export default function CustomerRecommendationDetailPage() {
  const { t, i18n } = useTranslation("customer");
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [detail, setDetail] = useState<CustomerRecommendationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/recommendations/${id}`, { cache: "no-store" });
      const body = await response.json() as { data?: CustomerRecommendationDetail };
      if (!response.ok || !body.data) throw new Error(t("ui.states.couldNotLoad"));
      setDetail(body.data);
      setError("");
    } catch {
      setError(t("ui.states.couldNotLoad"));
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  return <>
    <CustomerPageTitle eyebrow={t("ui.recommendations.community")} title={detail?.name ?? t("ui.recommendations.title")} description={t("ui.recommendations.description")} icon={<Star size={14} className="text-accent" />} />
    <CustomerPageShell wide className="pt-0 sm:pt-0">
      <div className="mb-5 flex items-center justify-between gap-3"><Link href="/customer/recommendations" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={15} />{t("ui.recommendations.myRecommendations")}</Link>{detail && <StatusBadge status={detail.status} />}</div>
      {loading ? <CustomerPanel><p className="text-sm text-muted-foreground">{t("ui.states.loading")}</p></CustomerPanel> : error || !detail ? <CustomerPanel><p role="alert" className="text-sm text-destructive">{error}</p><Button className="mt-3" variant="outline" onClick={() => void loadDetail()}>{t("ui.actions.retry")}</Button></CustomerPanel> : <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <CustomerPanel><h2 className="font-bold text-foreground">{detail.name}</h2><p className="mt-2 text-sm text-muted-foreground">{[detail.category, detail.state].filter(Boolean).join(" · ")}</p>{detail.description && <p className="mt-4 text-sm text-foreground">{detail.description}</p>}{detail.whyRecommend && <div className="mt-4 rounded-xl bg-muted/40 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("ui.recommendations.why")}</p><p className="mt-1 text-sm">{detail.whyRecommend}</p></div>}</CustomerPanel>
          {detail.changesRequested && <CustomerPanel className="border-amber-200 bg-amber-50"><h2 className="font-semibold text-amber-950">{t("ui.recommendations.status.changes_requested")}</h2><p className="mt-2 text-sm text-amber-900">{detail.changesRequested.message}</p>{detail.nextAction === "update_recommendation" && <Button asChild className="mt-4"><Link href="/customer/recommendations">{t("ui.recommendations.updateDetails")}</Link></Button>}</CustomerPanel>}
          {detail.decision?.message && <CustomerPanel><h2 className="font-semibold">{t(`ui.recommendations.status.${detail.status}`)}</h2><p className="mt-2 text-sm text-muted-foreground">{detail.decision.message}</p></CustomerPanel>}
          {detail.vendor && <CustomerPanel className="border-primary/20 bg-primary/[0.03]"><h2 className="font-semibold">{detail.vendor.name ?? detail.name}</h2><div className="mt-3 flex flex-wrap items-center gap-3"><Button asChild><Link href={`/customer/vendor/${detail.vendor.id}`}>{t("ui.recommendations.viewVendor")}</Link></Button><ShareButton shareType="vendor" contentId={detail.vendor.id} title={detail.vendor.name ?? detail.name} compact /></div></CustomerPanel>}
          {detail.vendor && <RecommendationEarningsPanel recommendationId={id} />}
        </div>
        <CustomerPanel><h2 className="font-bold text-foreground">{t("ui.labels.history")}</h2><ol className="mt-4 space-y-4"><li className="flex gap-3"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-primary" /><div><p className="text-sm font-semibold">{t("ui.recommendations.submitted")}</p><p className="text-xs text-muted-foreground">{new Date(detail.submittedAt).toLocaleString(i18n.resolvedLanguage)}</p></div></li>{detail.events.map((event) => <li key={event.id} className="flex gap-3"><Clock size={15} className="mt-0.5 shrink-0 text-accent" /><div><p className="text-sm font-semibold">{t(`ui.recommendations.status.${event.toStatus}`)}</p><p className="mt-1 text-sm text-muted-foreground">{event.message}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString(i18n.resolvedLanguage)}</p></div></li>)}</ol></CustomerPanel>
      </div>}
    </CustomerPageShell>
  </>;
}
