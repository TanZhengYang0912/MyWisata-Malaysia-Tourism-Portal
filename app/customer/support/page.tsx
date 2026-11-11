"use client";

// P4 — Member 4: customer "My Tickets" list. CLAUDE-FIXES.md Fix 2 — the
// missing customer-facing half of the ticket system (admin could already
// see tickets; customers had no way to see a reply).

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import { useTranslation } from "react-i18next";
import { supportError, supportTicketCreateFailure } from "@/lib/support/errors";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth";

interface TicketSummary {
  id: string;
  subject: string;
  category: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  lastActivityAt: string;
  unread: boolean;
}

interface TicketPageData {
  tickets: TicketSummary[];
  page: number;
  pageSize: 10;
  total: number;
  totalPages: number;
}

const STATUS_STYLE: Record<string, string> = {
  open: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  in_progress: "bg-teal/10 text-teal",
  resolved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  closed: "bg-muted text-muted-foreground",
};

function readTicketOperation(storageKey: string): string | null {
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function saveTicketOperation(storageKey: string, operationId: string) {
  try {
    window.localStorage.setItem(storageKey, operationId);
    return true;
  } catch {
    return false;
  }
}

function clearTicketOperation(storageKey: string) {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Removing a browser recovery hint must not block server-confirmed navigation.
  }
}

export default function CustomerSupportPage() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const currentUserId = currentUser?.id ?? null;
  const { t: tCustomer, i18n } = useTranslation("customer");
  const { t: tCommon } = useTranslation("common");
  const [tickets, setTickets] = useState<TicketSummary[] | null | undefined>(undefined);
  const [ticketsOwnerId, setTicketsOwnerId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [ticketCount, setTicketCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [withdrawalId, setWithdrawalId] = useState<string | null>(null);
  const [subject, setSubject] = useState(() => tCustomer("ui.support.withdrawalSubject"));
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [hasPendingTicketOperation, setHasPendingTicketOperation] = useState(false);
  const [ticketOperationUnknown, setTicketOperationUnknown] = useState(false);
  const [ticketOperationNotFound, setTicketOperationNotFound] = useState(false);
  const [checkingTicketOperation, setCheckingTicketOperation] = useState(false);
  const [ticketOperationCheckFailed, setTicketOperationCheckFailed] = useState(false);
  const [withdrawalNoLongerOnHold, setWithdrawalNoLongerOnHold] = useState(false);
  const [formError, setFormError] = useState("");
  const [draftVersion, setDraftVersion] = useState(0);
  const [draftSaved, setDraftSaved] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftLoadFailed, setDraftLoadFailed] = useState(false);
  const draftInputTouched = useRef(false);
  const supportScope = useRef<string | null>(null);
  const ticketsOwnerIdRef = useRef<string | null>(null);
  const scopeGeneration = useRef(0);
  const isMounted = useRef(false);
  const operationCheckController = useRef<AbortController | null>(null);
  const ticketListController = useRef<AbortController | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      operationCheckController.current?.abort();
    };
  }, []);

  const loadTickets = useCallback(async (signal?: AbortSignal) => {
    const targetUserId = currentUserId;
    ticketListController.current?.abort();
    const controller = new AbortController();
    ticketListController.current = controller;
    const abortFromCaller = () => controller.abort();
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    setLoadingTickets(true);
    try {
      const res = await fetch(`/api/support/tickets?page=${page}`, { cache: "no-store", signal: controller.signal });
      const body = (await res.json().catch(() => ({}))) as { data?: TicketPageData | null };
      if (!res.ok || !body.data) throw new Error("support_list_unavailable");
      if (controller.signal.aborted || currentUserId !== targetUserId) return;
      ticketsOwnerIdRef.current = targetUserId;
      setTicketsOwnerId(targetUserId);
      setTickets(body.data.tickets);
      setTicketCount(body.data.total);
      setTotalPages(body.data.totalPages);
      setLoadError(false);
      if (body.data.page !== page) setPage(body.data.page);
    } catch {
      if (controller.signal.aborted || currentUserId !== targetUserId) return;
      const canKeepVisibleTickets = ticketsOwnerIdRef.current === targetUserId;
      ticketsOwnerIdRef.current = targetUserId;
      setTicketsOwnerId(targetUserId);
      setTickets((current) => canKeepVisibleTickets && current !== undefined ? current : null);
      setLoadError(true);
    } finally {
      signal?.removeEventListener("abort", abortFromCaller);
      if (!controller.signal.aborted) setLoadingTickets(false);
    }
  }, [currentUserId, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWithdrawalId(new URLSearchParams(window.location.search).get("withdrawal"));
    const controller = new AbortController();
    void loadTickets(controller.signal);
    return () => controller.abort();
  }, [loadTickets]);

  useEffect(() => {
    return () => { ticketListController.current?.abort(); };
  }, [currentUserId]);

  async function checkTicketOperation(targetOperationId: string) {
    if (!currentUser?.id || !withdrawalId) return;
    const targetUserId = currentUser.id;
    const targetWithdrawalId = withdrawalId;
    const targetScope = `${targetUserId}:${targetWithdrawalId}`;
    const targetGeneration = scopeGeneration.current;
    operationCheckController.current?.abort();
    const controller = new AbortController();
    operationCheckController.current = controller;
    setCheckingTicketOperation(true);
    setTicketOperationCheckFailed(false);
    try {
      const response = await fetch(`/api/support/operations/${targetOperationId}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json().catch(() => ({})) as { data?: { state?: string; ticketId?: string } };
      if (controller.signal.aborted || !isMounted.current || supportScope.current !== targetScope || scopeGeneration.current !== targetGeneration) return;
      if (!response.ok || !result.data) throw new Error("support_operation_check_failed");
      if (result.data.state === "completed" && result.data.ticketId) {
        clearTicketOperation(`mw_support_ticket_operation:${targetUserId}:${targetWithdrawalId}`);
        setHasPendingTicketOperation(false);
        setTicketOperationUnknown(false);
        setTicketOperationNotFound(false);
        router.push(`/customer/support/${result.data.ticketId}`);
        return;
      }
      if (result.data.state === "not_found") {
        setTicketOperationUnknown(false);
        setTicketOperationNotFound(true);
        return;
      }
      throw new Error("support_operation_state_unavailable");
    } catch {
      if (controller.signal.aborted || !isMounted.current || supportScope.current !== targetScope || scopeGeneration.current !== targetGeneration) return;
      setTicketOperationUnknown(true);
      setTicketOperationCheckFailed(true);
    } finally {
      if (!controller.signal.aborted && isMounted.current && supportScope.current === targetScope && scopeGeneration.current === targetGeneration) {
        setCheckingTicketOperation(false);
      }
    }
  }

  useEffect(() => {
    const nextScope = currentUser?.id && withdrawalId ? `${currentUser.id}:${withdrawalId}` : null;
    const previousScope = supportScope.current;
    if (previousScope === nextScope) return;
    supportScope.current = nextScope;
    scopeGeneration.current += 1;
    operationCheckController.current?.abort();
    if (previousScope !== null) {
      draftInputTouched.current = false;
      setSubject(tCustomer("ui.support.withdrawalSubject"));
      setBody("");
      setOperationId(crypto.randomUUID());
      setSending(false);
      setCheckingTicketOperation(false);
      setSavingDraft(false);
      setHasPendingTicketOperation(false);
      setTicketOperationUnknown(false);
      setTicketOperationNotFound(false);
      setTicketOperationCheckFailed(false);
      setWithdrawalNoLongerOnHold(false);
      setFormError("");
      setDraftVersion(0);
      setDraftSaved(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, withdrawalId]);

  useEffect(() => {
    if (!currentUser?.id || !withdrawalId) return;
    const storageKey = `mw_support_ticket_operation:${currentUser.id}:${withdrawalId}`;
    const savedOperationId = readTicketOperation(storageKey);
    if (!savedOperationId) return;
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(savedOperationId)) {
      clearTicketOperation(storageKey);
      return;
    }
    // Only the operation reference is stored; the ticket text remains out of browser storage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOperationId(savedOperationId);
    setHasPendingTicketOperation(true);
    setTicketOperationUnknown(true);
    void checkTicketOperation(savedOperationId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, withdrawalId]);

  const loadWithdrawalDraft = useCallback(async (signal?: AbortSignal) => {
    if (!withdrawalId) return;
    const targetScope = `${currentUser?.id ?? ""}:${withdrawalId}`;
    setDraftLoadFailed(false);
    try {
      const response = await fetch(`/api/support/drafts?surface=ticket_create&target=${encodeURIComponent(withdrawalId)}`, { cache: "no-store", signal });
      const result = await response.json().catch(() => ({})) as { data?: { subject?: string; body?: string; version?: number } };
      if (!response.ok || !result.data) throw new Error("support_draft_load_failed");
      if (signal?.aborted || !isMounted.current || supportScope.current !== targetScope) return;
      if (draftInputTouched.current) return;
      setSubject(result.data.subject ?? "");
      setBody(result.data.body ?? "");
      setDraftVersion(result.data.version ?? 0);
      setDraftSaved(Boolean(result.data.version));
    } catch {
      if (!signal?.aborted && isMounted.current && supportScope.current === targetScope) setDraftLoadFailed(true);
    }
  }, [currentUser?.id, withdrawalId]);

  useEffect(() => {
    const controller = new AbortController();
    // This effect starts an external read; state updates happen only after its response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadWithdrawalDraft(controller.signal);
    return () => controller.abort();
  }, [currentUser?.id, loadWithdrawalDraft]);

  async function saveWithdrawalDraft() {
    if (!withdrawalId || savingDraft || !body.trim()) return;
    const targetScope = `${currentUser?.id ?? ""}:${withdrawalId}`;
    const targetGeneration = scopeGeneration.current;
    const isCurrentRequest = () => isMounted.current
      && supportScope.current === targetScope
      && scopeGeneration.current === targetGeneration;
    setSavingDraft(true);
    try {
      const response = await fetch("/api/support/drafts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface: "ticket_create", target: withdrawalId, subject, body, expectedVersion: draftVersion }),
      });
      const result = await response.json().catch(() => ({})) as { data?: { version?: number } };
      if (!isCurrentRequest()) return;
      if (!response.ok || typeof result.data?.version !== "number") {
        setFormError(tCommon("chatbot.handoff.draftSaveFailed"));
        return;
      }
      setDraftVersion(result.data.version);
      setDraftSaved(true);
      setFormError("");
    } catch {
      if (!isCurrentRequest()) return;
      setFormError(tCommon("chatbot.handoff.draftSaveFailed"));
    } finally {
      if (isCurrentRequest()) setSavingDraft(false);
    }
  }

  async function submitWithdrawalTicket(event: FormEvent) {
    event.preventDefault();
    if (!currentUser?.id || !withdrawalId || body.trim().length < 1 || ticketOperationUnknown || checkingTicketOperation || withdrawalNoLongerOnHold) return;
    const targetUserId = currentUser.id;
    const targetWithdrawalId = withdrawalId;
    const targetScope = `${targetUserId}:${targetWithdrawalId}`;
    const targetGeneration = scopeGeneration.current;
    const activeOperationId = operationId;
    const storageKey = `mw_support_ticket_operation:${targetUserId}:${targetWithdrawalId}`;
    if (!saveTicketOperation(storageKey, activeOperationId)) {
      setFormError(tCustomer("ui.support.operationStorageUnavailable"));
      return;
    }
    setHasPendingTicketOperation(true);
    setSending(true); setFormError("");
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ withdrawalId, operationId: activeOperationId, subject, body }),
      });
      const result = await response.json().catch(() => ({})) as { data?: { id: string }; error?: { code?: string } };
      if (!isMounted.current || supportScope.current !== targetScope || scopeGeneration.current !== targetGeneration) return;
      if (!response.ok || !result.data) {
        const failure = supportTicketCreateFailure(response.status, result.error?.code);
        if (failure === "unknown") {
          setTicketOperationUnknown(true);
          setTicketOperationNotFound(false);
          setFormError(tCommon("chatbot.supportErrors.checking"));
          return;
        }
        clearTicketOperation(storageKey);
        setHasPendingTicketOperation(false);
        if (failure === "withdrawal_no_longer_on_hold") {
          setWithdrawalNoLongerOnHold(true);
          setFormError(tCustomer("ui.support.withdrawalNoLongerOnHold"));
          return;
        }
        setFormError(result.error?.code ? tCommon(`chatbot.supportErrors.${supportError(result.error.code).key}`) : tCustomer("ui.support.createError"));
        return;
      }
      clearTicketOperation(storageKey);
      setHasPendingTicketOperation(false);
      void fetch(`/api/support/drafts?surface=ticket_create&target=${encodeURIComponent(targetWithdrawalId)}`, { method: "DELETE" }).catch(() => undefined);
      router.push(`/customer/support/${result.data.id}`);
    } catch {
      if (!isMounted.current || supportScope.current !== targetScope || scopeGeneration.current !== targetGeneration) return;
      setTicketOperationUnknown(true);
      setTicketOperationNotFound(false);
      setFormError(tCommon("chatbot.supportErrors.checking"));
    } finally {
      if (isMounted.current && supportScope.current === targetScope && scopeGeneration.current === targetGeneration) setSending(false);
    }
  }

  if (tickets === undefined || ticketsOwnerId !== currentUserId) {
    return <CustomerPageShell><div role="status" aria-live="polite" className="py-8 text-sm text-muted-foreground">{tCustomer("ui.states.loading")}</div></CustomerPageShell>;
  }
  if (tickets === null) {
    return (
      <CustomerPageShell><EmptyState
        title={tCustomer("ui.support.loadError")}
        description={tCustomer("ui.states.loadingError")}
        action={<Button type="button" variant="outline" onClick={() => void loadTickets()}>{tCommon("chatbot.faq.retry")}</Button>}
      /></CustomerPageShell>
    );
  }

  return (
    <>
      <CustomerPageTitle
        eyebrow={tCustomer("ui.support.title")}
        title={tCustomer("ui.support.myTickets")}
        description={tCustomer("ui.support.description")}
        icon={<MessageSquare size={14} aria-hidden="true" />}
      />

      <CustomerPageShell wide className="pt-0 sm:pt-0">

      {withdrawalId && <form onSubmit={submitWithdrawalTicket} className="mb-6 rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-5 space-y-3">
        <p className="font-semibold text-foreground">{tCustomer("ui.support.contact")}</p>
        <p className="text-sm text-muted-foreground">{tCustomer("ui.support.reference")} {withdrawalId}</p>
        <input value={subject} onChange={(event) => { draftInputTouched.current = true; setSubject(event.target.value); if (!hasPendingTicketOperation) setOperationId(crypto.randomUUID()); setTicketOperationNotFound(false); setDraftSaved(false); }} maxLength={255} disabled={ticketOperationUnknown || sending || withdrawalNoLongerOnHold} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm disabled:opacity-60" aria-label={tCustomer("ui.support.subject")} />
        <textarea value={body} onChange={(event) => { draftInputTouched.current = true; setBody(event.target.value); if (!hasPendingTicketOperation) setOperationId(crypto.randomUUID()); setTicketOperationNotFound(false); setDraftSaved(false); }} required maxLength={2000} placeholder={tCustomer("ui.support.explain")} disabled={ticketOperationUnknown || sending || withdrawalNoLongerOnHold} className="min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm disabled:opacity-60" aria-label={tCustomer("ui.support.message")} />
        {formError && <p role="alert" aria-live="assertive" className="text-sm text-red-600 dark:text-red-300">{formError}</p>}
        {ticketOperationUnknown && <div role="alert" className="flex items-center justify-between gap-3 text-sm text-red-600 dark:text-red-300">
          <span>{ticketOperationCheckFailed ? tCommon("chatbot.supportErrors.unavailable") : tCommon("chatbot.supportErrors.checking")}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void checkTicketOperation(operationId)} disabled={checkingTicketOperation}>{checkingTicketOperation ? tCommon("states.loadingEllipsis") : tCommon("chatbot.handoff.check")}</Button>
        </div>}
        {ticketOperationNotFound && <p role="status" className="text-sm text-muted-foreground">{tCommon("chatbot.handoff.notCreated")}</p>}
        {withdrawalNoLongerOnHold && <Link href={`/customer/wallet/withdrawals/${withdrawalId}`} className="inline-flex text-sm font-medium text-primary underline">{tCustomer("ui.support.openWithdrawal")}</Link>}
        {draftLoadFailed && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{tCommon("chatbot.handoff.draftLoadFailed")} <button type="button" className="underline" onClick={() => void loadWithdrawalDraft()}>{tCommon("chatbot.handoff.retryDraftLoad")}</button></p>}
        <div className="flex items-center gap-2">
          {draftSaved && <span className="mr-auto text-xs text-muted-foreground">{tCommon("chatbot.handoff.draftSaved")}</span>}
          <Button type="button" variant="outline" onClick={() => void saveWithdrawalDraft()} disabled={savingDraft || ticketOperationUnknown || withdrawalNoLongerOnHold || !body.trim()}>{savingDraft ? tCommon("states.loadingEllipsis") : tCommon("chatbot.handoff.saveDraft")}</Button>
          <button type="submit" disabled={sending || checkingTicketOperation || ticketOperationUnknown || withdrawalNoLongerOnHold || !body.trim()} aria-busy={sending} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{sending ? tCustomer("ui.states.sending") : ticketOperationNotFound ? tCommon("chatbot.handoff.retrySame") : tCustomer("ui.support.sendInformation")}</button>
        </div>
      </form>}

      {tickets.length === 0 ? (
        <EmptyState
          title={tCustomer("ui.states.noTickets")}
          description={tCustomer("ui.support.noTicketsDescription")}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_24px_rgba(1,0,102,0.06)]">
          <div className="divide-y divide-border">
            {tickets.map((t) => (
              <Link
                key={t.id}
                href={`/customer/support/${t.id}`}
                className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset sm:px-6"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <MessageSquare size={13} aria-hidden="true" className="text-muted-foreground shrink-0" /> {t.subject}
                    {t.unread && <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.category} · {tCustomer("ui.support.lastActivity")} {new Date(t.lastActivityAt).toLocaleDateString(i18n.resolvedLanguage || undefined)}
                  </p>
                </div>
                <span className={`text-xs font-semibold rounded-full px-3 py-1.5 shrink-0 ${STATUS_STYLE[t.status] ?? ""}`}>
                  {tCustomer(`ui.support.status.${t.status}`)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
      {loadingTickets && tickets.length > 0 && (
        <p role="status" aria-live="polite" className="mt-3 text-sm text-muted-foreground">{tCommon("states.loadingEllipsis")}</p>
      )}
      {loadError && tickets.length > 0 && (
        <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{tCustomer("ui.support.loadError")}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadTickets()} disabled={loadingTickets}>{tCommon("chatbot.faq.retry")}</Button>
        </div>
      )}
      <Pagination
        ariaLabel={tCommon("pagination.navLabel")}
        currentPage={page}
        totalPages={totalPages}
        totalItems={ticketCount}
        pageSize={10}
        onPageChange={setPage}
        disabled={loadingTickets}
      />
      </CustomerPageShell>
    </>
  );
}
