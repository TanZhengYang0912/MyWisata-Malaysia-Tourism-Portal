"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/providers/app-dialog";
import { TravelDetailsFields, TravelDetailsSummary, type TravelDetailsDraft } from "@/components/profile/travel-details-fields";
import { EMPTY_PERSONAL_DETAILS, type PersonalTravelDetails } from "@/lib/profile/travel-details";
import { personalTravelDetailsSchema } from "@/lib/validation/travel-details";
import { requestTravelDetails, travelDetailsErrorKey } from "@/lib/profile/travel-details-client";

export function PersonalTravelDetailsPanel({ userId }: { userId: string }) {
  const { t } = useTranslation("customer");
  const { confirm } = useAppDialog();
  const [reload, setReload] = useState(0);
  const requestKey = `${userId}:${reload}`;
  const [result, setResult] = useState<{ key: string; data: PersonalTravelDetails | null; error: string | null } | null>(null);
  const [draft, setDraft] = useState<TravelDetailsDraft>({ ...EMPTY_PERSONAL_DETAILS, contactPhone: null, relationship: null });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const current = result?.key === requestKey ? result : null;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; mutation.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    requestTravelDetails<PersonalTravelDetails>("/api/profile/personal-details", { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setResult({ key: requestKey, data, error: null }); })
      .catch((cause) => { if (!controller.signal.aborted) setResult({ key: requestKey, data: null, error: travelDetailsErrorKey(cause) }); });
    return () => controller.abort();
  }, [requestKey]);

  async function save(event: FormEvent) {
    event.preventDefault();
    const parsed = personalTravelDetailsSchema.safeParse({ legalName: draft.legalName, dateOfBirth: draft.dateOfBirth, gender: draft.gender, nationalityCode: draft.nationalityCode, emergencyContact: draft.emergencyContact });
    if (!parsed.success) { setError("ui.travelDetails.validationError"); return; }
    await mutate("PUT", parsed.data);
  }
  async function mutate(method: "PUT" | "DELETE", body?: PersonalTravelDetails) {
    const controller = new AbortController(); mutation.current = controller;
    setBusy(true); setError(null);
    try {
      const data = await requestTravelDetails<PersonalTravelDetails>("/api/profile/personal-details", {
        method, signal: controller.signal,
        ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
      });
      if (!controller.signal.aborted) { setResult({ key: requestKey, data, error: null }); setEditing(false); }
    } catch (cause) { if (!controller.signal.aborted) setError(travelDetailsErrorKey(cause)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function clear() {
    if (await confirm(t("ui.travelDetails.clearPersonalConfirm")) && mounted.current) await mutate("DELETE");
  }
  if (!current) return <p role="status" className="text-sm text-muted-foreground">{t("ui.travelDetails.loading")}</p>;
  if (current.error || !current.data) return <div role="alert" className="space-y-3"><p>{t(current.error ?? "ui.travelDetails.requestError")}</p><Button variant="outline" onClick={() => setReload((value) => value + 1)}>{t("ui.travelDetails.retry")}</Button></div>;
  const hasDetails = Object.values(current.data).some((value) => value !== null);
  return <div className="space-y-4">
    <p className="text-xs text-muted-foreground">{t("ui.travelDetails.privateHint")}</p>
    {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
    {editing ? <form onSubmit={save} className="space-y-4">
      <TravelDetailsFields value={draft} onChange={setDraft} disabled={busy} />
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>{t(busy ? "ui.travelDetails.saving" : "ui.travelDetails.save")}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(false); setError(null); }}>{t("ui.travelDetails.cancel")}</Button></div>
    </form> : <>
      <TravelDetailsSummary value={current.data} />
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => { setDraft({ ...current.data!, contactPhone: null, relationship: null }); setEditing(true); setError(null); }}>{t("ui.travelDetails.edit")}</Button>{hasDetails && <Button variant="ghost" disabled={busy} onClick={() => void clear()}>{t("ui.travelDetails.clearPersonal")}</Button>}</div>
    </>}
  </div>;
}
