"use client";

import { useCallback, useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { StatusBadge } from "@/components/shared/status-badge";

type ProductOption = { id: string; name: string };
type Placement = {
  id: string;
  product_id: string;
  state: string | null;
  category_slug: string | null;
  starts_at: string;
  ends_at: string;
  priority: number;
  status: "draft" | "pending_approval" | "approved" | "rejected" | "paused";
  products?: ProductOption | ProductOption[] | null;
};

const CATEGORY_OPTIONS = ["food", "activity", "accommodation", "retail"] as const;

export default function SponsoredPlacementsPage() {
  const { t } = useTranslation("admin");
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [productId, setProductId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [priority, setPriority] = useState(0);
  const [allStates, setAllStates] = useState(true);
  const [state, setState] = useState("");
  const [allCategories, setAllCategories] = useState(true);
  const [categorySlug, setCategorySlug] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/sponsored-placements", { cache: "no-store" });
      const payload = await response.json();
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) throw new Error(payload.error?.message || t("sponsoredPlacements.errors.load"));
      setProducts(payload.data?.products ?? []);
      setPlacements(payload.data?.placements ?? []);
      setForbidden(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("sponsoredPlacements.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load synchronizes the page with the guarded server resource
    void load();
  }, [load]);

  async function createDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/sponsored-placements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          priority,
          allStates,
          ...(allStates ? {} : { state }),
          allCategories,
          ...(allCategories ? {} : { categorySlug }),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t("sponsoredPlacements.errors.create"));
      setProductId("");
      setStartsAt("");
      setEndsAt("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("sponsoredPlacements.errors.create"));
    } finally {
      setBusy(false);
    }
  }

  async function transition(placement: Placement, action: "submit" | "approve" | "reject" | "pause") {
    const reason = action === "reject" ? window.prompt(t("sponsoredPlacements.prompts.rejectReason")) : null;
    if (action === "reject" && reason === null) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/sponsored-placements/${placement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(action === "reject" ? { reason } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t("sponsoredPlacements.errors.transition"));
      await load();
    } catch (reasonValue) {
      setError(reasonValue instanceof Error ? reasonValue.message : t("sponsoredPlacements.errors.transition"));
    } finally {
      setBusy(false);
    }
  }

  function productName(placement: Placement) {
    const relation = Array.isArray(placement.products) ? placement.products[0] : placement.products;
    return relation?.name ?? products.find((product) => product.id === placement.product_id)?.name ?? placement.product_id;
  }

  const actionsFor = (placement: Placement) => {
    if (placement.status === "draft") return [{ action: "submit" as const, label: t("sponsoredPlacements.actions.submit") }];
    if (placement.status === "pending_approval") return [
      { action: "approve" as const, label: t("sponsoredPlacements.actions.approve") },
      { action: "reject" as const, label: t("sponsoredPlacements.actions.reject") },
    ];
    if (placement.status === "approved") return [{ action: "pause" as const, label: t("sponsoredPlacements.actions.pause") }];
    return [];
  };

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<><Megaphone size={15} /> {t("sponsoredPlacements.eyebrow")}</>}
        title={t("sponsoredPlacements.title")}
        description={t("sponsoredPlacements.description")}
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("sponsoredPlacements.states.loading")}</p>
      ) : forbidden ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
          {t("sponsoredPlacements.errors.forbidden")}
        </div>
      ) : (
        <>
          {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
          <form onSubmit={createDraft} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-bold text-foreground">{t("sponsoredPlacements.form.title")}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm font-semibold text-foreground">
                {t("sponsoredPlacements.form.product")}
                <select required aria-label={t("sponsoredPlacements.form.product")} value={productId} onChange={(event) => setProductId(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
                  <option value="">{t("sponsoredPlacements.form.chooseProduct")}</option>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-foreground">
                {t("sponsoredPlacements.form.startsAt")}
                <input required type="datetime-local" aria-label={t("sponsoredPlacements.form.startsAt")} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
              </label>
              <label className="text-sm font-semibold text-foreground">
                {t("sponsoredPlacements.form.endsAt")}
                <input required type="datetime-local" aria-label={t("sponsoredPlacements.form.endsAt")} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
              </label>
              <label className="text-sm font-semibold text-foreground">
                {t("sponsoredPlacements.form.priority")}
                <input required min={0} max={1000} type="number" aria-label={t("sponsoredPlacements.form.priority")} value={priority} onChange={(event) => setPriority(Number(event.target.value))} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" aria-label={t("sponsoredPlacements.form.allStates")} checked={allStates} onChange={(event) => setAllStates(event.target.checked)} /> {t("sponsoredPlacements.form.allStates")}</label>
                {!allStates && <input required aria-label={t("sponsoredPlacements.form.state")} value={state} onChange={(event) => setState(event.target.value)} placeholder={t("sponsoredPlacements.form.state")} className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />}
              </div>
              <div className="rounded-xl border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" aria-label={t("sponsoredPlacements.form.allCategories")} checked={allCategories} onChange={(event) => setAllCategories(event.target.checked)} /> {t("sponsoredPlacements.form.allCategories")}</label>
                {!allCategories && <select required aria-label={t("sponsoredPlacements.form.category")} value={categorySlug} onChange={(event) => setCategorySlug(event.target.value)} className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm"><option value="">{t("sponsoredPlacements.form.chooseCategory")}</option>{CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{t(`sponsoredPlacements.categories.${category}`)}</option>)}</select>}
              </div>
            </div>
            <button disabled={busy} type="submit" className="mt-4 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{t("sponsoredPlacements.form.create")}</button>
          </form>

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4"><h2 className="font-bold text-foreground">{t("sponsoredPlacements.list.title")}</h2></div>
            {placements.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">{t("sponsoredPlacements.states.empty")}</p> : <div className="divide-y divide-border">{placements.map((placement) => (
              <article key={placement.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(180px,1fr)_150px_120px_minmax(180px,auto)] md:items-center">
                <div><p className="font-semibold text-foreground">{productName(placement)}</p><p className="mt-1 text-xs text-muted-foreground">{placement.state ?? t("sponsoredPlacements.scope.allStates")} · {placement.category_slug ?? t("sponsoredPlacements.scope.allCategories")}</p></div>
                <div className="text-xs text-muted-foreground"><p>{new Date(placement.starts_at).toLocaleString()}</p><p>{new Date(placement.ends_at).toLocaleString()}</p></div>
                <div><StatusBadge status={t(`sponsoredPlacements.status.${placement.status}`)} /></div>
                <div className="flex flex-wrap justify-end gap-2">{actionsFor(placement).map(({ action, label }) => <button key={action} disabled={busy} type="button" onClick={() => void transition(placement, action)} className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-primary hover:bg-secondary disabled:opacity-50">{label}</button>)}</div>
              </article>
            ))}</div>}
          </section>
        </>
      )}
    </AdminPageShell>
  );
}
