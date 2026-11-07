"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { adminFilterControlClassName } from "@/components/admin/filter-bar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { formatDateTime } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  senderCode: string;
  campaignId: string | null;
  createdAt: string;
}

interface CampaignOption { id: string; title: string }

const EMPTY_FORM = { title: "", body: "", senderCode: "ADMIN", campaignId: "" };

export default function AnnouncementsPage() {
  const { t, i18n } = useTranslation("admin");
  const { showFeedback } = useActionFeedback();
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/announcements", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? t("announcements.errors.load"));
      setAnnouncements(body.data?.announcements ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("announcements.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadCampaigns = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/promotion-campaigns", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.ok) setCampaigns((body.data?.campaigns ?? []).map((c: { id: string; title: string }) => ({ id: c.id, title: c.title })));
    } catch {
      // Optional — the campaign-link picker is just hidden if this fails (e.g. no permission for that module).
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); void loadCampaigns(); }, [load, loadCampaigns]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          body: form.body.trim(),
          senderCode: form.senderCode.trim() || "ADMIN",
          campaignId: form.campaignId || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? t("announcements.errors.save"));
      showFeedback("success", t("announcements.saved"));
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : t("announcements.errors.save"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<><Megaphone size={15} /> {t("announcements.eyebrow")}</>}
        title={t("announcements.title")}
      />
      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}

      <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-bold text-foreground">{t("announcements.form.title")}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-foreground md:col-span-2">
            {t("announcements.form.announcementTitle")}
            <Input required minLength={3} maxLength={160} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="mt-2" />
          </label>
          <label className="text-sm font-semibold text-foreground md:col-span-2">
            {t("announcements.form.body")}
            <Textarea required minLength={10} maxLength={5000} rows={5} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} className="mt-2" />
          </label>
          <label className="text-sm font-semibold text-foreground">
            {t("announcements.form.senderCode")}
            <Input maxLength={20} value={form.senderCode} onChange={(event) => setForm({ ...form, senderCode: event.target.value })} className="mt-2" />
          </label>
          {campaigns.length > 0 && (
            <label className="text-sm font-semibold text-foreground">
              {t("announcements.form.linkedCampaign")}
              <select value={form.campaignId} onChange={(event) => setForm({ ...form, campaignId: event.target.value })} className={`mt-2 w-full ${adminFilterControlClassName}`}>
                <option value="">{t("announcements.form.noCampaign")}</option>
                {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}
              </select>
            </label>
          )}
        </div>
        <Button type="submit" disabled={submitting}><Send size={15} /> {t("announcements.form.send")}</Button>
      </form>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4"><h2 className="font-bold text-foreground">{t("announcements.list.title")}</h2></div>
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t("announcements.loading")}</p>
        ) : announcements.length === 0 ? (
          <EmptyState icon={<Megaphone size={28} />} title={t("announcements.empty.title")} description={t("announcements.empty.description")} />
        ) : (
          <div className="divide-y divide-border">
            {announcements.map((announcement) => (
              <article key={announcement.id} className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-foreground">{announcement.title}</h3>
                  <span className="text-xs text-muted-foreground">{announcement.senderCode} · {formatDateTime(announcement.createdAt, locale, { timeZone: "Asia/Kuala_Lumpur" })}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{announcement.body}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </AdminPageShell>
  );
}
