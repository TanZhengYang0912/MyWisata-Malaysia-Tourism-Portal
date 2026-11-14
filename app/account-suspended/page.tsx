"use client";

import Link from "next/link";
import { FormEvent, MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/providers/auth";
import { useTranslation } from "react-i18next";

type OperationState = "idle" | "checking" | "unknown" | "not_found";

interface OperationResponse {
  data?: { state?: string; ticketId?: string };
}

interface AppealResponse {
  data?: { id?: string };
  error?: { code?: string };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function operationStorageKey(userId: string) {
  return `mylawatan:suspended-appeal-operation:${userId}`;
}

export default function AccountSuspendedPage() {
  const { currentUser } = useAuth();
  return <SuspendedAccountAppeal key={currentUser?.id ?? "signed-out"} currentUser={currentUser} />;
}

function SuspendedAccountAppeal({ currentUser }: { currentUser: { id: string; email?: string | null } | null }) {
  const { t } = useTranslation("customer");
  const currentUserId = currentUser?.id ?? null;
  const translateRef = useRef(t);

  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [operationOwnerId, setOperationOwnerId] = useState<string | null>(null);
  const [operationState, setOperationState] = useState<OperationState>("idle");
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [signInRequired, setSignInRequired] = useState(false);

  useEffect(() => { translateRef.current = t; }, [t]);

  const checkOperation = useCallback(async (targetOperationId: string) => {
    if (!currentUserId) return;
    const targetUserId = currentUserId;
    setBusy(true);
    setOperationState("checking");
    setError(null);
    try {
      const response = await fetch(`/api/support/operations/${targetOperationId}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({})) as OperationResponse;
      if (response.status === 401) {
        setSignInRequired(true);
        setOperationState("unknown");
        setError(translateRef.current("accountLifecycle.suspended.signInAgain"));
        return;
      }
      if (!response.ok || !result.data) throw new Error("result_unavailable");

      if (result.data.state === "completed" && result.data.ticketId && uuidPattern.test(result.data.ticketId)) {
        try { window.localStorage.removeItem(operationStorageKey(targetUserId)); } catch { setStorageUnavailable(true); }
        setTicketId(result.data.ticketId);
        setBody("");
        setOperationId(null);
        setOperationOwnerId(null);
        setOperationState("idle");
        setSignInRequired(false);
        setError(null);
        return;
      }
      if (result.data.state === "not_found") {
        setSignInRequired(false);
        setOperationState("not_found");
        setError(translateRef.current("accountLifecycle.suspended.operationNotFound"));
        return;
      }
      throw new Error("result_unavailable");
    } catch {
      setOperationState("unknown");
      setSignInRequired(false);
      setError(translateRef.current("accountLifecycle.suspended.statusUnknown"));
    } finally {
      setBusy(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    let isActive = true;
    let savedOperationId: string | null = null;
    try {
      savedOperationId = window.localStorage.getItem(operationStorageKey(currentUserId));
    } catch {
      queueMicrotask(() => {
        if (!isActive) return;
        setStorageUnavailable(true);
        setError(translateRef.current("accountLifecycle.suspended.storageUnavailable"));
      });
      return () => { isActive = false; };
    }

    if (!savedOperationId || !uuidPattern.test(savedOperationId)) {
      if (savedOperationId) {
        try { window.localStorage.removeItem(operationStorageKey(currentUserId)); }
        catch { queueMicrotask(() => { if (isActive) setStorageUnavailable(true); }); }
      }
      // Share only the operation reference across windows; free-text details stay in memory.
      return () => { isActive = false; };
    }

    queueMicrotask(() => {
      if (!isActive) return;
      setOperationId(savedOperationId);
      setOperationOwnerId(currentUserId);
      void checkOperation(savedOperationId);
    });
    return () => { isActive = false; };
  }, [checkOperation, currentUserId]);

  useEffect(() => {
    if (!currentUserId) return;
    const key = operationStorageKey(currentUserId);
    const syncOperationAcrossWindows = (event: StorageEvent) => {
      if (event.key !== key) return;
      const targetOperationId = event.newValue ?? event.oldValue;
      if (!targetOperationId || !uuidPattern.test(targetOperationId)) return;
      setOperationId(targetOperationId);
      setOperationOwnerId(currentUserId);
      void checkOperation(targetOperationId);
    };
    window.addEventListener("storage", syncOperationAcrossWindows);
    return () => window.removeEventListener("storage", syncOperationAcrossWindows);
  }, [checkOperation, currentUserId]);

  useEffect(() => {
    if (!body.trim() || ticketId) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [body, ticketId]);

  function clearOperation(targetUserId: string) {
    try { window.localStorage.removeItem(operationStorageKey(targetUserId)); }
    catch { setStorageUnavailable(true); }
    setOperationId(null);
    setOperationOwnerId(null);
    setOperationState("idle");
  }

  function confirmLeaveWithUnsavedAppeal(event: MouseEvent<HTMLAnchorElement>) {
    if (body.trim() && !ticketId && !window.confirm(t("accountLifecycle.suspended.leaveWithDraft"))) {
      event.preventDefault();
    }
  }

  async function submitAppeal(event: FormEvent) {
    event.preventDefault();
    if (!currentUserId) {
      setSignInRequired(true);
      setError(t("accountLifecycle.suspended.signInAgain"));
      return;
    }
    if (body.trim().length < 10) {
      setError(t("accountLifecycle.suspended.minimumAppeal"));
      return;
    }
    if (body.trim().length > 2000) {
      setError(t("accountLifecycle.suspended.maximumAppeal"));
      return;
    }

    const targetUserId = currentUserId;
    const savedOperationId = operationOwnerId === targetUserId ? operationId : null;
    let targetOperationId = savedOperationId;
    try {
      if (!targetOperationId) targetOperationId = window.crypto.randomUUID();
      window.localStorage.setItem(operationStorageKey(targetUserId), targetOperationId);
      setStorageUnavailable(false);
    } catch {
      setStorageUnavailable(true);
      setError(t("accountLifecycle.suspended.storageUnavailable"));
      return;
    }

    setOperationId(targetOperationId);
    setOperationOwnerId(targetUserId);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account-suspended/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim(), operationId: targetOperationId }),
      });
      const result = await response.json().catch(() => ({})) as AppealResponse;
      if (response.status === 401) {
        setSignInRequired(true);
        setOperationState("unknown");
        setError(t("accountLifecycle.suspended.signInAgain"));
        return;
      }
      if (response.ok && result.data?.id && uuidPattern.test(result.data.id)) {
        try { window.localStorage.removeItem(operationStorageKey(targetUserId)); } catch { setStorageUnavailable(true); }
        setTicketId(result.data.id);
        setBody("");
        setOperationId(null);
        setOperationOwnerId(null);
        setOperationState("idle");
        setSignInRequired(false);
        return;
      }

      if (result.error?.code === "ACCOUNT_NOT_SUSPENDED") {
        clearOperation(targetUserId);
        setSignInRequired(false);
        setError(t("accountLifecycle.suspended.statusChanged"));
        return;
      }

      if (result.error?.code === "APPEAL_TOO_SHORT") {
        setSignInRequired(false);
        setOperationState("idle");
        setError(t("accountLifecycle.suspended.cleanedAppealTooShort"));
        return;
      }
      if (result.error?.code === "APPEAL_TOO_LONG") {
        setSignInRequired(false);
        setOperationState("idle");
        setError(t("accountLifecycle.suspended.cleanedAppealTooLong"));
        return;
      }
      if (result.error?.code === "CONTENT_PROCESSING_UNAVAILABLE") {
        setSignInRequired(false);
        setOperationState("idle");
        setError(t("accountLifecycle.suspended.submitError"));
        return;
      }

      setOperationState("unknown");
      setSignInRequired(false);
      setError(result.error?.code === "OPERATION_CONFLICT"
        ? t("accountLifecycle.suspended.operationConflict")
        : t("accountLifecycle.suspended.statusUnknown"));
    } catch {
      setOperationState("unknown");
      setSignInRequired(false);
      setError(t("accountLifecycle.suspended.statusUnknown"));
    } finally {
      setBusy(false);
    }
  }

  const hasPendingOperation = Boolean(operationId && operationOwnerId === currentUserId);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6 py-10">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">{t("accountLifecycle.suspended.title")}</h1>
        <p className="mt-3 text-sm text-muted-foreground text-center">
          {currentUser?.email ? `${currentUser.email} ${t("accountLifecycle.suspended.statusSuffix")}` : t("accountLifecycle.suspended.status")} {t("accountLifecycle.suspended.contact")}
        </p>
        {ticketId ? (
          <div className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-4 text-center" role="status" aria-live="polite">
            <p className="text-sm font-semibold text-primary">{t("accountLifecycle.suspended.appealSubmitted")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("accountLifecycle.suspended.ticket", { ticketId })}</p>
            <Link href={`/customer/support/${ticketId}`} className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">{t("accountLifecycle.suspended.viewTicket")}</Link>
          </div>
        ) : (
          <form onSubmit={submitAppeal} className="mt-6 space-y-3">
            <label className="block text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("accountLifecycle.suspended.appealLabel")}
              <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} maxLength={2000} placeholder={t("accountLifecycle.suspended.appealPlaceholder")} className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
            </label>
            {error && <p className="text-left text-sm text-destructive" role="alert">{error}</p>}
            {signInRequired && <Link href="/login?next=%2Faccount-suspended" onClick={confirmLeaveWithUnsavedAppeal} className="inline-flex text-sm font-semibold text-primary underline">{t("ui.guest.signIn")}</Link>}
            {storageUnavailable && <p className="sr-only" aria-live="polite">{t("accountLifecycle.suspended.storageUnavailable")}</p>}
            <button type="submit" disabled={busy || storageUnavailable || operationState === "unknown" || operationState === "checking" || body.trim().length < 10} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
              {busy && operationState === "checking" ? t("accountLifecycle.suspended.checkingResult") : busy ? t("accountLifecycle.suspended.submitting") : t("accountLifecycle.suspended.submit")}
            </button>
            {hasPendingOperation && (operationState === "unknown" || operationState === "not_found") && (
              <button type="button" onClick={() => void checkOperation(operationId!)} disabled={busy} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground disabled:opacity-50">
                {busy ? t("accountLifecycle.suspended.checkingResult") : t("accountLifecycle.suspended.checkResult")}
              </button>
            )}
          </form>
        )}
        <Link href="/customer/support" onClick={confirmLeaveWithUnsavedAppeal} className="mt-5 block text-center text-xs font-semibold text-muted-foreground hover:text-primary">{t("accountLifecycle.suspended.viewTickets")}</Link>
      </section>
    </main>
  );
}
