"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronLeft, ChevronRight, MessageSquare, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type SupportTicket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  lastActivityAt: string;
  unread: boolean;
};

type TicketPage = { tickets: SupportTicket[]; page: number; total: number; totalPages: number };
type HandoffPreview = { subject: string; summary: string; handoffToken: string };

const OPERATION_STORAGE_PREFIX = "mw_manual_support_operation:";
const STATUS_STYLE: Record<string, string> = {
  open: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  resolved: "bg-emerald-100 text-emerald-800",
  closed: "bg-muted text-muted-foreground",
};

export function ChatWidgetHumanSupport({ userId, onBack }: { userId: string; onBack: () => void }) {
  const { t, i18n } = useTranslation("common");
  const [page, setPage] = useState(1);
  const [ticketPage, setTicketPage] = useState<TicketPage | null>(null);
  const [listError, setListError] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [preview, setPreview] = useState<HandoffPreview | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [requiresSignIn, setRequiresSignIn] = useState(false);
  const [resultUnknown, setResultUnknown] = useState(false);
  const [recoveringSubmission, setRecoveringSubmission] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const operationIdRef = useRef<string | null>(null);
  const listRequestRef = useRef<AbortController | null>(null);

  const loadTickets = useCallback(async (targetPage: number, signal?: AbortSignal) => {
    listRequestRef.current?.abort();
    const controller = new AbortController();
    listRequestRef.current = controller;
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    setListLoading(true);
    setListError(false);
    try {
      const response = await fetch(`/api/support/tickets?page=${targetPage}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json().catch(() => ({})) as { data?: TicketPage | null };
      if (response.status === 401 && !controller.signal.aborted) setRequiresSignIn(true);
      if (!response.ok || !result.data) throw new Error("support_ticket_list_unavailable");
      if (!controller.signal.aborted) {
        setRequiresSignIn(false);
        setTicketPage(result.data);
        if (result.data.page !== targetPage) setPage(result.data.page);
      }
    } catch {
      if (!controller.signal.aborted) setListError(true);
    } finally {
      signal?.removeEventListener("abort", abortFromCaller);
      if (!controller.signal.aborted) setListLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch the first ticket page when this channel opens
    void loadTickets(page, controller.signal);
    return () => {
      controller.abort();
      listRequestRef.current?.abort();
    };
  }, [loadTickets, page]);

  useEffect(() => {
    const storageKey = `${OPERATION_STORAGE_PREFIX}${userId}`;
    let pendingOperationId: string | null = null;
    try {
      const saved = window.sessionStorage.getItem(storageKey);
      pendingOperationId = saved && /^[0-9a-f-]{36}$/i.test(saved) ? saved : null;
      if (saved && !pendingOperationId) window.sessionStorage.removeItem(storageKey);
    } catch {
      pendingOperationId = null;
    }
    operationIdRef.current = pendingOperationId;
    if (!pendingOperationId) return;

    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lock the channel until a pending ticket result is reconciled
    setRecoveringSubmission(true);
    void fetch(`/api/support/operations/${pendingOperationId}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, result: await response.json().catch(() => ({})) as { data?: { state?: string; ticketId?: string } | null } }))
      .then(({ response, result }) => {
        if (controller.signal.aborted) return;
        if (response.ok && result.data?.state === "completed" && result.data.ticketId) {
          setTicketId(result.data.ticketId);
          setResultUnknown(false);
          return;
        }
        if (response.ok && result.data?.state === "not_found") {
          setResultUnknown(true);
          return;
        }
        if (response.status === 401) setRequiresSignIn(true);
        setResultUnknown(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setResultUnknown(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRecoveringSubmission(false);
      });
    return () => controller.abort();
  }, [userId]);

  function resetPreview() {
    setPreview(null);
    setConsent(false);
    setFormError("");
    setRequiresSignIn(false);
  }

  async function preparePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || resultUnknown) return;
    const normalizedSubject = subject.trim();
    const normalizedBody = body.trim();
    if (!normalizedSubject || normalizedSubject.length > 255 || !normalizedBody || normalizedBody.length > 2000) {
      setFormError(t("chatbot.humanSupport.checkFields"));
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const response = await fetch("/api/support/handoff/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: normalizedSubject, summary: normalizedBody }),
      });
      const result = await response.json().catch(() => ({})) as { data?: HandoffPreview | null; error?: { code?: string } | null };
      if (!response.ok || !result.data) {
        setRequiresSignIn(response.status === 401);
        setFormError(response.status === 401 ? t("chatbot.humanSupport.signInAgain") : t("chatbot.humanSupport.previewFailed"));
        return;
      }
      setPreview(result.data);
      setConsent(false);
    } catch {
      setFormError(t("chatbot.humanSupport.previewFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function submitTicket() {
    if (!preview || !consent || busy || resultUnknown) return;
    setBusy(true);
    setFormError("");
    const operationId = operationIdRef.current ?? crypto.randomUUID();
    operationIdRef.current = operationId;
    try {
      window.sessionStorage.setItem(`${OPERATION_STORAGE_PREFIX}${userId}`, operationId);
    } catch {
      operationIdRef.current = null;
      setFormError(t("chatbot.humanSupport.retryStorageUnavailable"));
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationId,
          handoffToken: preview.handoffToken,
          consent: true,
          subject: preview.subject,
          body: preview.summary,
        }),
      });
      const result = await response.json().catch(() => ({})) as { data?: { id?: string } | null; error?: { code?: string } | null };
      if (response.ok && result.data?.id) {
        setTicketId(result.data.id);
        setResultUnknown(false);
        try {
          window.sessionStorage.removeItem(`${OPERATION_STORAGE_PREFIX}${userId}`);
        } catch {
          // The completed ticket remains discoverable in My Tickets.
        }
        operationIdRef.current = null;
        if (page === 1) void loadTickets(1);
        else setPage(1);
        return;
      }
      if (response.status === 401) {
        setRequiresSignIn(true);
        operationIdRef.current = null;
        try { window.sessionStorage.removeItem(`${OPERATION_STORAGE_PREFIX}${userId}`); } catch { /* authentication failure is definitive */ }
        setFormError(t("chatbot.humanSupport.signInAgain"));
      } else if (response.status >= 500 || result.error?.code === "WRITE_UNAVAILABLE" || result.error?.code === "OPERATION_UNKNOWN") {
        setResultUnknown(true);
        setFormError(t("chatbot.humanSupport.resultUnknown"));
      } else {
        operationIdRef.current = null;
        try { window.sessionStorage.removeItem(`${OPERATION_STORAGE_PREFIX}${userId}`); } catch { /* definitive rejection */ }
        setFormError(t("chatbot.humanSupport.submitFailed"));
      }
    } catch {
      setResultUnknown(true);
      setFormError(t("chatbot.humanSupport.resultUnknown"));
    } finally {
      setBusy(false);
    }
  }

  async function checkTicketResult() {
    const operationId = operationIdRef.current;
    if (!operationId || busy) return;
    setBusy(true);
    setFormError("");
    try {
      const response = await fetch(`/api/support/operations/${operationId}`, { cache: "no-store" });
      const result = await response.json().catch(() => ({})) as { data?: { state?: string; ticketId?: string } | null };
      if (response.ok && result.data?.state === "completed" && result.data.ticketId) {
        setTicketId(result.data.ticketId);
        setResultUnknown(false);
        try {
          window.sessionStorage.removeItem(`${OPERATION_STORAGE_PREFIX}${userId}`);
        } catch {
          // The completed ticket remains discoverable in My Tickets.
        }
        operationIdRef.current = null;
        if (page === 1) void loadTickets(1);
        else setPage(1);
      } else if (response.ok && result.data?.state === "not_found") {
        setResultUnknown(true);
        setFormError(t("chatbot.humanSupport.notFoundRetry"));
      } else if (response.status === 401) {
        setRequiresSignIn(true);
        setFormError(t("chatbot.humanSupport.signInAgain"));
      } else {
        setFormError(t("chatbot.humanSupport.checkFailed"));
      }
    } catch {
      setFormError(t("chatbot.humanSupport.checkFailed"));
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = (status: string) => {
    const supportedStatuses = ["open", "in_progress", "resolved", "closed"] as const;
    const safeStatus = supportedStatuses.find((candidate) => candidate === status) ?? "unknown";
    return t(`chatbot.humanSupport.status.${safeStatus}`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <button type="button" onClick={onBack} className="mr-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground sm:hidden"><ChevronLeft size={14} />{t("actions.back")}</button>
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">{t("chatbot.humanSupport.title")}</h2>
          <p className="truncate text-xs text-muted-foreground">{t("chatbot.humanSupport.subtitle")}</p>
        </div>
        {!formOpen && <Button type="button" size="sm" onClick={() => { setFormOpen(true); setTicketId(null); }}><Plus size={14} />{t("chatbot.humanSupport.create")}</Button>}
      </div>

      {ticketId ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-5 text-center">
          <p className="text-sm font-semibold text-foreground">{t("chatbot.humanSupport.created")}</p>
          <Link href={`/customer/support/${ticketId}`} className="text-sm font-semibold text-primary underline">{t("chatbot.humanSupport.openTicket")}</Link>
          <Button type="button" variant="outline" size="sm" onClick={() => { setTicketId(null); setFormOpen(false); }}>{t("chatbot.humanSupport.backToTickets")}</Button>
        </div>
      ) : recoveringSubmission || (resultUnknown && !preview) ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-5 text-center">
          <p role="alert" className="max-w-sm text-xs text-destructive">{formError || t("chatbot.humanSupport.resultUnknown")}</p>
          {requiresSignIn && <Link href="/login?next=%2Fcustomer%2Fsupport" className="text-xs font-semibold text-primary underline">{t("chatbot.loginRequired.action")}</Link>}
          <Button type="button" size="sm" onClick={() => void checkTicketResult()} disabled={busy || recoveringSubmission}>{t("chatbot.humanSupport.checkResult")}</Button>
          <Link href="/customer/support" className="text-xs text-primary underline">{t("chatbot.myTickets")}</Link>
        </div>
      ) : formOpen ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <Button type="button" variant="ghost" size="sm" className="mb-3 px-0" onClick={() => { setFormOpen(false); resetPreview(); }}>
            <ArrowLeft size={14} />{t("chatbot.humanSupport.backToTickets")}
          </Button>
          {!preview ? (
            <form onSubmit={(event) => void preparePreview(event)} className="space-y-3">
              <label className="block text-xs font-semibold text-foreground">
                {t("chatbot.humanSupport.subject")}
                <input maxLength={255} value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary" required />
              </label>
              <label className="block text-xs font-semibold text-foreground">
                {t("chatbot.humanSupport.description")}
                <textarea maxLength={2000} rows={5} value={body} onChange={(event) => setBody(event.target.value)} className="mt-1.5 w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal outline-none focus:border-primary" required />
              </label>
              {formError && <p role="alert" className="text-xs text-destructive">{formError}{requiresSignIn && <> <Link href="/login?next=%2Fcustomer%2Fsupport" className="underline">{t("chatbot.loginRequired.action")}</Link></>}</p>}
              <Button type="submit" disabled={busy || !subject.trim() || !body.trim()}>{busy ? t("chatbot.humanSupport.working") : t("chatbot.humanSupport.preview")}</Button>
            </form>
          ) : (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">{t("chatbot.humanSupport.review")}</h3>
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold">{preview.subject}</p>
                <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{preview.summary}</p>
              </div>
              <label className="flex items-start gap-2 text-xs text-foreground">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5" />
                <span>{t("chatbot.humanSupport.consent")}</span>
              </label>
              {formError && <p role="alert" className="text-xs text-destructive">{formError}{requiresSignIn && <> <Link href="/login?next=%2Fcustomer%2Fsupport" className="underline">{t("chatbot.loginRequired.action")}</Link></>}</p>}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => resetPreview()} disabled={busy || resultUnknown}>{t("chatbot.humanSupport.edit")}</Button>
                {resultUnknown ? (
                  <Button type="button" onClick={() => void checkTicketResult()} disabled={busy}>{busy ? t("chatbot.humanSupport.working") : t("chatbot.humanSupport.checkResult")}</Button>
                ) : (
                  <Button type="button" onClick={() => void submitTicket()} disabled={!consent || busy}>{busy ? t("chatbot.humanSupport.working") : t("chatbot.humanSupport.submit")}</Button>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {listError ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <p role="alert" className="text-xs text-destructive">{requiresSignIn ? t("chatbot.humanSupport.signInAgain") : t("chatbot.humanSupport.listFailed")}</p>
              {requiresSignIn ? (
                <Link href="/login?next=%2Fcustomer%2Fsupport" className="text-xs font-semibold text-primary underline">{t("chatbot.loginRequired.action")}</Link>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => void loadTickets(page)} disabled={listLoading}><RefreshCw size={13} />{t("chatbot.humanSupport.retry")}</Button>
              )}
            </div>
          ) : listLoading && !ticketPage ? (
            <p className="py-8 text-center text-xs text-muted-foreground">{t("chatbot.humanSupport.loading")}</p>
          ) : ticketPage?.tickets.length ? (
            <>
              {ticketPage.tickets.map((ticket) => (
                <Link key={ticket.id} href={`/customer/support/${ticket.id}`} className="mb-2 flex items-center gap-2.5 rounded-xl border border-border p-3 transition-colors hover:bg-secondary/60">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageSquare size={16} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{ticket.subject}{ticket.unread && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-destructive align-middle" />}</span>
                    <span className="mt-1 block text-[0.6875rem] text-muted-foreground">{ticket.category} · {new Date(ticket.lastActivityAt).toLocaleDateString(i18n.resolvedLanguage || undefined)}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-[0.625rem] font-semibold ${STATUS_STYLE[ticket.status] ?? "bg-muted text-muted-foreground"}`}>{statusLabel(ticket.status)}</span>
                </Link>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-2 text-xs text-muted-foreground">
                <span>{t("chatbot.humanSupport.ticketCount", { count: ticketPage.total })}</span>
                <div className="flex items-center gap-1">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={t("chatbot.humanSupport.previousPage")} disabled={page <= 1 || listLoading} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={15} /></Button>
                  <span>{page}/{ticketPage.totalPages}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={t("chatbot.humanSupport.nextPage")} disabled={page >= ticketPage.totalPages || listLoading} onClick={() => setPage((current) => current + 1)}><ChevronRight size={15} /></Button>
                </div>
              </div>
            </>
          ) : (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">{t("chatbot.humanSupport.empty")}</p>
              <Button type="button" className="mt-3" onClick={() => setFormOpen(true)}><Plus size={14} />{t("chatbot.humanSupport.create")}</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
