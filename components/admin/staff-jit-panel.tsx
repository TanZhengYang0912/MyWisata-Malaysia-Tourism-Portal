"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth";
import { runStaffPasskey } from "@/lib/auth/staff-passkey-browser";

type JitRequest = {
  id: string;
  request_key: string;
  permission_key: string;
  reason: string;
  duration_minutes: number;
  state: string;
  requested_at: string;
  activation_expires_at: string | null;
  expires_at: string | null;
  version: number;
};

type JitPage = { items: JitRequest[]; enabled: boolean; eligible: boolean };
const JIT_STATES = ["pending", "approved", "rejected", "withdrawn", "active", "expired", "revoked"] as const;

function readPendingRequestKey(actorId: string) {
  try {
    return window.sessionStorage.getItem(`staff-jit-request-key:${actorId}`);
  } catch {
    return null;
  }
}

function writePendingRequestKey(actorId: string, requestKey: string | null) {
  try {
    const key = `staff-jit-request-key:${actorId}`;
    if (requestKey) window.sessionStorage.setItem(key, requestKey);
    else window.sessionStorage.removeItem(key);
  } catch {
    // The in-memory request key still protects retries in the current page.
  }
}

export function StaffJitPanel() {
  const { t } = useTranslation("auth");
  const { refreshUser } = useAuth();
  const [items, setItems] = useState<JitRequest[]>([]);
  const [durationMinutes, setDurationMinutes] = useState<30 | 60>(30);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [actorId, setActorId] = useState<string | null>(null);
  const [pendingRequestKey, setPendingRequestKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/staff/jit?page=1&pageSize=25", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.code ?? "STAFF_JIT_UNAVAILABLE");
      const data = body.data as JitPage;
      setItems(data.items ?? []);
      setEnabled(data.enabled === true);
      setEligible(data.eligible === true);
      const currentActorId = typeof body.data.actorId === "string" ? body.data.actorId : null;
      setActorId(currentActorId);
      if (currentActorId) {
        const storedRequestKey = readPendingRequestKey(currentActorId);
        if (storedRequestKey) {
          const isVisible = (data.items ?? []).some((item: JitRequest) => item.request_key === storedRequestKey);
          if (isVisible) {
            writePendingRequestKey(currentActorId, null);
            setPendingRequestKey(null);
            setMessage(t("staffHome.jit.requestSubmitted"));
          } else {
            setPendingRequestKey(storedRequestKey);
          }
        }
      }
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "STAFF_JIT_UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function submitRequest() {
    setMessage(null);
    setError(null);
    if (!actorId) return;
    const requestKey = pendingRequestKey ?? crypto.randomUUID();
    writePendingRequestKey(actorId, requestKey);
    setPendingRequestKey(requestKey);
    let isUnknown = true;
    try {
      const response = await fetch("/api/staff/jit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestKey, permissionKey: "admin.kyc.review", durationMinutes, reason }),
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status < 500) {
          isUnknown = false;
          writePendingRequestKey(actorId, null);
          setPendingRequestKey(null);
        }
        throw new Error(body.error?.code ?? "STAFF_JIT_UNAVAILABLE");
      }
      writePendingRequestKey(actorId, null);
      setPendingRequestKey(null);
      setReason("");
      setMessage(t("staffHome.jit.requestSubmitted"));
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "STAFF_JIT_UNAVAILABLE");
      if (isUnknown) setMessage(t("staffHome.jit.requestOutcomeUnknown"));
      await refresh();
    }
  }

  async function updateRequest(item: JitRequest, action: "activate" | "withdraw" | "end") {
    setBusyId(item.id);
    setError(null);
    setMessage(null);
    try {
      let body: Record<string, unknown>;
      if (action === "activate") {
        const proof = await runStaffPasskey({
          operation: "jit-activate",
          payload: { requestId: item.id, requestVersion: item.version },
        });
        if (!proof.proofId) throw new Error("STAFF_PASSKEY_FAILED");
        body = { action, proofId: proof.proofId };
      } else {
        body = { action, reason: reason.trim() || t("staffHome.jit.defaultEndReason") };
      }
      const response = await fetch(`/api/staff/jit/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.code ?? "STAFF_JIT_UNAVAILABLE");
      setMessage(t("staffHome.jit.updated"));
      await refreshUser();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "STAFF_JIT_UNAVAILABLE");
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  return <section className="mt-7 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold text-foreground">{t("staffHome.jit.title")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("staffHome.jit.description")}</p></div>
      <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>{t("staffHome.jit.refresh")}</Button>
    </div>
    {enabled && eligible ? <div className="mt-5 grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-end">
      <label className="grid gap-1.5 text-sm font-medium text-foreground">{t("staffHome.jit.duration")}
        <select className="h-10 rounded-md border border-input bg-background px-3" value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value) as 30 | 60)}>
          <option value={30}>{t("staffHome.jit.minutes", { count: 30 })}</option><option value={60}>{t("staffHome.jit.minutes", { count: 60 })}</option>
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-foreground">{t("staffHome.jit.reason")}
        <textarea className="min-h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <Button type="button" onClick={() => void submitRequest()} disabled={!actorId || reason.trim().length < 10}>{pendingRequestKey ? t("staffHome.jit.retryRequest") : t("staffHome.jit.request")}</Button>
    </div> : <p className="mt-5 text-sm text-muted-foreground">{t("staffHome.jit.unavailable")}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{t("staffHome.jit.errors.generic")}</p>}
    {message && <p role="status" className="mt-3 text-sm text-primary">{message}</p>}
    {loading ? <p className="mt-5 text-sm text-muted-foreground">{t("staffHome.jit.loading")}</p> : items.length === 0
      ? <p className="mt-5 text-sm text-muted-foreground">{t("staffHome.jit.empty")}</p>
      : <ul className="mt-5 divide-y divide-border rounded-xl border border-border">
        {items.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><p className="font-semibold text-foreground">{t("staffHome.jit.permission")}</p><p className="mt-1 text-sm text-muted-foreground">{t("staffHome.jit.stateDuration", { state: t(`staffHome.jit.states.${JIT_STATES.includes(item.state as typeof JIT_STATES[number]) ? item.state : "expired"}`), duration: t("staffHome.jit.minutes", { count: item.duration_minutes }) })}</p><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{item.reason}</p></div>
          <div className="flex flex-wrap gap-2">
            {item.state === "approved" && <Button type="button" size="sm" disabled={busyId === item.id} onClick={() => void updateRequest(item, "activate")}>{t("staffHome.jit.activate")}</Button>}
            {item.state === "pending" && <Button type="button" variant="outline" size="sm" disabled={busyId === item.id} onClick={() => void updateRequest(item, "withdraw")}>{t("staffHome.jit.withdraw")}</Button>}
            {item.state === "active" && <Button type="button" variant="outline" size="sm" disabled={busyId === item.id} onClick={() => void updateRequest(item, "end")}>{t("staffHome.jit.end")}</Button>}
          </div>
        </li>)}
      </ul>}
  </section>;
}
