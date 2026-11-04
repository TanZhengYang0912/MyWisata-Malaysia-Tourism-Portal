"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DirectoryPagination } from "@/components/customer/directory-pagination";
import { useAppDialog } from "@/components/providers/app-dialog";
import { TravelDetailsFields, TravelDetailsSummary, type TravelDetailsDraft } from "@/components/profile/travel-details-fields";
import { EMPTY_TRAVELLER, TRAVELLERS_PAGE_SIZE, type SavedTraveller, type TravellersPage } from "@/lib/profile/travel-details";
import { savedTravellerSchema } from "@/lib/validation/travel-details";
import { requestTravelDetails, travelDetailsErrorKey } from "@/lib/profile/travel-details-client";

export function SavedTravellers({ userId }: { userId: string }) {
  const { t } = useTranslation("customer");
  const { confirm } = useAppDialog();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data: TravellersPage | null; error: string | null } | null>(null);
  const [editor, setEditor] = useState<{ id: string | null; draft: TravelDetailsDraft } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const requestKey = `${userId}:${page}:${revision}`;
  const current = result?.key === requestKey ? result : null;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; mutation.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    requestTravelDetails<TravellersPage>(`/api/profile/travellers?page=${page}`, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        if (page > data.pages) { setPage(data.pages); return; }
        setResult({ key: requestKey, data, error: null });
      }).catch((cause) => { if (!controller.signal.aborted) setResult({ key: requestKey, data: null, error: travelDetailsErrorKey(cause) }); });
    return () => controller.abort();
  }, [page, requestKey]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || busy) return;
    const parsed = savedTravellerSchema.safeParse(editor.draft);
    if (!parsed.success) { setError("ui.travelDetails.validationError"); return; }
    const controller = new AbortController(); mutation.current = controller;
    setBusy(true); setError(null);
    try {
      await requestTravelDetails<SavedTraveller>(editor.id ? `/api/profile/travellers/${editor.id}` : "/api/profile/travellers", {
        method: editor.id ? "PUT" : "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data),
      });
      if (!controller.signal.aborted) { if (!editor.id) setPage(1); setEditor(null); setRevision((value) => value + 1); }
    } catch (cause) { if (!controller.signal.aborted) setError(travelDetailsErrorKey(cause)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function remove(traveller: SavedTraveller) {
    if (busy || !await confirm(t("ui.travelDetails.deleteConfirm", { name: traveller.legalName })) || !mounted.current) return;
    const controller = new AbortController(); mutation.current = controller;
    setBusy(true); setError(null);
    try {
      await requestTravelDetails(`/api/profile/travellers/${traveller.id}`, { method: "DELETE", signal: controller.signal });
      if (!controller.signal.aborted) {
        if (current?.data?.travellers.length === 1 && page > 1) setPage((value) => value - 1);
        setRevision((value) => value + 1);
      }
    } catch (cause) { if (!controller.signal.aborted) setError(travelDetailsErrorKey(cause)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <div className="space-y-4">
    <p className="text-xs text-muted-foreground">{t("ui.travelDetails.travellersHint")}</p>
    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    {editor ? <form onSubmit={save} className="space-y-4 rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold">{t(editor.id ? "ui.travelDetails.editTraveller" : "ui.travelDetails.addTraveller")}</h3>
      <TravelDetailsFields value={editor.draft} traveller disabled={busy} onChange={(draft) => setEditor({ ...editor, draft })} />
      <div className="flex gap-2"><Button type="submit" disabled={busy}>{t(busy ? "ui.travelDetails.saving" : "ui.travelDetails.save")}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setEditor(null); setError(null); }}>{t("ui.travelDetails.cancel")}</Button></div>
    </form> : <Button type="button" variant="outline" disabled={busy || !current?.data} onClick={() => { setEditor({ id: null, draft: { ...EMPTY_TRAVELLER } }); setError(null); }}>{t("ui.travelDetails.addTraveller")}</Button>}
    {!current ? <p role="status" className="text-sm text-muted-foreground">{t("ui.travelDetails.loading")}</p> : current.error || !current.data ? <div role="alert" className="space-y-3"><p>{t(current.error ?? "ui.travelDetails.requestError")}</p><Button variant="outline" onClick={() => setRevision((value) => value + 1)}>{t("ui.travelDetails.retry")}</Button></div> : <>
      <p role="status" className="text-xs text-muted-foreground">{t("ui.travelDetails.travellerCount", { count: current.data.total })}</p>
      {current.data.travellers.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{t("ui.travelDetails.noTravellers")}</p> : <div className="divide-y divide-border">{current.data.travellers.map((traveller) => <article key={traveller.id} className="space-y-3 py-4">
        <TravelDetailsSummary value={traveller} />
        {traveller.relationship && <p className="text-xs text-muted-foreground">{traveller.relationship}</p>}
        <div className="flex gap-2"><Button variant="outline" size="sm" disabled={busy || editor !== null} aria-label={t("ui.travelDetails.editNamedTraveller", { name: traveller.legalName })} onClick={() => { setEditor({ id: traveller.id, draft: { legalName: traveller.legalName, dateOfBirth: traveller.dateOfBirth, gender: traveller.gender, nationalityCode: traveller.nationalityCode, emergencyContact: traveller.emergencyContact, contactPhone: traveller.contactPhone, relationship: traveller.relationship } }); setError(null); }}>{t("ui.travelDetails.edit")}</Button><Button variant="ghost" size="sm" disabled={busy || editor !== null} aria-label={t("ui.travelDetails.deleteNamedTraveller", { name: traveller.legalName })} onClick={() => void remove(traveller)}>{t("ui.travelDetails.delete")}</Button></div>
      </article>)}</div>}
      <DirectoryPagination ariaLabel={t("ui.travelDetails.travellersTitle")} itemLabel={t("ui.travelDetails.travellersTitle")} variant="marketplace" pageSize={TRAVELLERS_PAGE_SIZE} currentPage={page} totalPages={current.data.pages} totalItems={current.data.total} onPageChange={(nextPage) => { if (!busy && !editor) setPage(nextPage); }} />
    </>}
  </div>;
}
