"use client";

// P4 — Member 4: FAQ chatbot widget. See CLAUDE.md Step 7.
//
// CLAUDE-CHATBOT-FEEDBACK.md: escalation is now customer-controlled, not
// automatic. Every bot reply carries its own small feedback state machine:
//   answered   -> "Was this helpful?" (Yes collapses to thanks, No -> ticket offer)
//   unanswered -> straight to the ticket offer (no helpfulness question —
//                 the bot already said it didn't know)
//   ticket offer -> Yes creates a ticket via the existing endpoint, No dismisses
// Nothing here ever calls POST /api/support/tickets except the ticket
// offer's own "Yes" — there is no automatic escalation path left.
//
// CLAUDE-FIXES.md Fix 2: "close the loop" — escalation used to tell the
// user nothing beyond "a ticket has been created." Still true here: the
// ticket_created stage names the ticket and links to My Tickets.
//
// CLAUDE-P4-EXTRAS.md Extra 1 (trilingual): every bot message carries the
// answer language returned by /api/chatbot/ask as metadata. That
// ChatLanguage value remains independent from the UI locale: answer text is
// rendered exactly as returned, while this widget's fixed chrome follows the
// app translation runtime.
//
// Widget merge (2026-09): what used to be a single-mode AI chat panel is now
// a Shopee-Chat-style split view — this component owns the shared chrome
// (toggle bubble, top bar, panel sizing) and the left/right pane routing;
// the AI-support conversation logic below is otherwise unchanged, just
// rendered in the right pane instead of filling the whole panel. Vendor
// threads live in the sibling components under chat-widget/.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, HelpCircle, MessageCircle, Mic, MicOff, Minimize2, Maximize2, Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/pagination";
import { useAppDialog } from "@/components/providers/app-dialog";
import type { FaqCategory, FaqQuestionPage } from "@/app/api/chatbot/faq/route";
import type { ChatLanguage } from "@/lib/chatbot/language";
import { useAuth } from "@/components/providers/auth";
import { useSupportChat } from "@/components/providers/support-chat";
import { useSpeechInput, resolveRecognitionLang } from "@/hooks/use-speech-input";
import { ChatWidgetInbox } from "@/components/shared/chat-widget/chat-widget-inbox";
import { ChatWidgetVendorThread } from "@/components/shared/chat-widget/chat-widget-vendor-thread";
import { ChatWidgetHumanSupport } from "@/components/shared/chat-widget/chat-widget-human-support";
import { resolveCustomerSupportIntent } from "@/lib/chatbot/customer-intent";
import type { CustomerStatusItem } from "@/lib/chatbot/customer-tools";
import type { CustomerStatusKind } from "@/lib/chatbot/policy";
import type { SupportPolicyAction } from "@/lib/chatbot/policy";
import { supportError } from "@/lib/support/errors";

// CLAUDE-VOICE-INPUT.md Part 2. Friendly copy per error kind — never a raw
// error/exception reaching this UI (the hook itself already guarantees
// that; this is just the last-mile string).
type FeedbackStage =
  | "awaiting_helpful" // Flow 1: bot answered, ask "was this helpful?"
  | "helpful_done" // collapsed after Yes
  | "awaiting_ticket" // Flow 2 (bot couldn't answer) or Flow 1's "No" — offer a ticket
  | "handoff_preview" // User reviews and edits the exact ticket content before sharing
  | "ticket_created" // collapsed after the ticket offer's Yes succeeds
  | "ticket_declined"; // collapsed after the ticket offer's No

const LOCALIZED_FAQ_CATEGORIES = new Set(["account", "affiliate", "booking", "general", "payment", "rewards", "vendor", "wallet"]);

function faqCategoryLabel(category: string, translate: (key: string) => string): string {
  if (LOCALIZED_FAQ_CATEGORIES.has(category)) return translate(`chatbot.faq.categories.${category}`);
  return category.charAt(0).toUpperCase() + category.slice(1);
}

interface ChatMessage {
  role: "user" | "bot";
  text: string;
  persistedId?: string;
  localId?: string;
  /** Bot messages only — ties this reply to its chatbot_feedback row. */
  messageId?: string;
  /** Bot messages only — the user's question this reply answers, used as the ticket subject/body if one gets opened. */
  question?: string;
  /** Bot messages only — answer language returned by the chatbot API. */
  language?: ChatLanguage;
  /** The original question was withheld from AI; the reply used local FAQ matching. */
  privacyBlocked?: boolean;
  feedbackStage?: FeedbackStage;
  feedbackSaving?: boolean;
  feedbackSaveFailed?: boolean;
  feedbackNeedsSignIn?: boolean;
  feedbackLoginHref?: string;
  feedbackVote?: boolean;
  ticketId?: string;
  ticketError?: string;
  ticketErrorCode?: string;
  statusItems?: CustomerStatusItem[];
  statusKind?: CustomerStatusKind;
  statusActions?: readonly SupportPolicyAction[];
  statusRetryAvailable?: boolean;
  evidence?: { title: string; contentVersion: number; checkedAt: string }[];
  statusActionHref?: string;
  statusActionLabel?: string;
  handoffSubject?: string;
  handoffSummary?: string;
  handoffPreviewSubject?: string;
  handoffPreviewSummary?: string;
  handoffSourceMessage?: string | null;
  handoffOperationId?: string;
  handoffDraftTarget?: string;
  handoffDraftVersion?: number;
  handoffDraftSaved?: boolean;
  handoffConsented?: boolean;
  ticketOperationUnknown?: boolean;
  ticketOperationNotFound?: boolean;
  handoffDraftLoadFailed?: boolean;
  ticketNeedsSignIn?: boolean;
}

interface ChatHistoryCursor {
  createdAt: string;
  id: string;
}

type ChatbotAnswerData = Pick<ChatMessage, "text" | "messageId" | "language" | "privacyBlocked" | "evidence"> & {
  botAnswered: boolean;
};

export function createBotMessage(data: ChatbotAnswerData, question: string): ChatMessage {
  return {
    role: "bot",
    text: data.text,
    persistedId: data.messageId,
    messageId: data.messageId,
    question,
    language: data.language,
    privacyBlocked: data.privacyBlocked,
    evidence: data.evidence,
    feedbackStage: data.botAnswered ? "awaiting_helpful" : "awaiting_ticket",
  };
}

export function resolveTicketSubject(question: string | undefined, fallback: string): string {
  return (question?.trim() || fallback).slice(0, 255);
}

export function chatbotSessionStorageKey(userId: string | null): string {
  return `mw_chatbot_session:${userId ?? "guest"}`;
}

function customerStatusPage(kind: CustomerStatusKind): string {
  if (kind === "tickets") return "/customer/support";
  if (kind === "bookings") return "/customer/calendar";
  if (kind === "withdrawals") return "/customer/wallet/withdrawals";
  if (kind === "kyc") return "/customer/kyc";
  return "/customer/orders";
}

async function fetchCustomerStatus(kind: CustomerStatusKind) {
  try {
    const response = await fetch("/api/support/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
    });
    const result = await response.json().catch(() => ({})) as {
      data?: { state?: string; items?: CustomerStatusItem[]; actions?: readonly SupportPolicyAction[] };
    };
    return { ok: response.ok, signInRequired: response.status === 401, data: result.data };
  } catch {
    return { ok: false, signInRequired: false, data: undefined };
  }
}

function chatbotAskOperationStorageKey(sessionKey: string): string {
  return `mw_chatbot_ask_operation:${sessionKey}`;
}

function readPendingAskOperation(sessionKey: string): string | null {
  try {
    const operationId = window.localStorage.getItem(chatbotAskOperationStorageKey(sessionKey));
    return operationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operationId)
      ? operationId
      : null;
  } catch {
    return null;
  }
}

function storePendingAskOperation(sessionKey: string, operationId: string | null): boolean {
  try {
    const key = chatbotAskOperationStorageKey(sessionKey);
    if (operationId) window.localStorage.setItem(key, operationId);
    else window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function chatbotPendingOperationsStorageKey(userId: string): string {
  return `mw_chatbot_support_operations:${userId}`;
}

function readPendingSupportOperation(userId: string | null, messageId: string | undefined): string | null {
  if (!userId || !messageId) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(chatbotPendingOperationsStorageKey(userId)) ?? "{}") as Record<string, unknown>;
    const operationId = parsed[messageId];
    return typeof operationId === "string" && /^[0-9a-f-]{36}$/i.test(operationId) ? operationId : null;
  } catch {
    return null;
  }
}

function storePendingSupportOperation(userId: string, messageId: string, operationId: string | null) {
  try {
    const key = chatbotPendingOperationsStorageKey(userId);
    const current = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
    if (operationId) current[messageId] = operationId;
    else delete current[messageId];
    const bounded = Object.fromEntries(Object.entries(current).slice(-20));
    window.localStorage.setItem(key, JSON.stringify(bounded));
  } catch {
    // The request still uses the server operation key; storage failure only limits refresh recovery.
  }
}

async function postFeedback(payload: Record<string, unknown>) {
  try {
    const response = await fetch("/api/chatbot/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { saved: response.ok, requiresSignIn: response.status === 401 };
  } catch {
    return { saved: false, requiresSignIn: false };
  }
}

export function ChatbotWidget({ hideLauncherOnMobile = false }: { hideLauncherOnMobile?: boolean }) {
  // Lifted to context (CLAUDE-SUPPORT-MUTE-REPORT.md Feature 1) so other
  // entry points — the profile page's "Contact Support" button, outlet and
  // activity page "Message vendor" buttons — can open this same widget
  // instance instead of building a second chat surface.
  const { open, setOpen, selected, selectChat, unreadChatCount } = useSupportChat();
  const { currentUser, loading: authLoading } = useAuth();
  const { t, i18n } = useTranslation("common");
  const { confirm } = useAppDialog();
  const { t: tCustomer } = useTranslation("customer");
  const identityKey = currentUser?.id ?? null;
  const identityRef = useRef<string | null>(identityKey);
  const [storedSession, setStoredSession] = useState<{ ownerId: string | null; value: string | null }>({ ownerId: identityKey, value: null });
  const sessionKey = storedSession.ownerId === identityKey ? storedSession.value : null;
  const setSessionKey = (value: string | null) => setStoredSession({ ownerId: identityRef.current, value });
  const [guestClaimCandidate, setGuestClaimCandidate] = useState<{ ownerId: string; sessionKey: string } | null>(null);
  const [guestClaiming, setGuestClaiming] = useState(false);
  const [guestClaimError, setGuestClaimError] = useState<string | null>(null);
  const [guestRecoverySessionKey, setGuestRecoverySessionKey] = useState<string | null>(null);
  const [messageState, setMessageState] = useState<{ ownerId: string | null; value: ChatMessage[] }>({ ownerId: identityKey, value: [] });
  const messages = useMemo(() => messageState.ownerId === identityKey ? messageState.value : [], [identityKey, messageState]);
  const setMessages = (update: ChatMessage[] | ((current: ChatMessage[]) => ChatMessage[])) => setMessageState((previous) => {
    const current = previous.ownerId === identityRef.current ? previous.value : [];
    return { ownerId: identityRef.current, value: typeof update === "function" ? update(current) : update };
  });
  const [historyCursor, setHistoryCursor] = useState<ChatHistoryCursor | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const historyLoadedRef = useRef<string | null>(null);
  const freshGuestSessionRef = useRef<string | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);
  const historyRequestKeyRef = useRef<string | null>(null);
  const historyRefreshAtRef = useRef(0);
  const supportPaneWasOpenRef = useRef(false);
  const [inputState, setInputState] = useState<{ ownerId: string | null; value: string }>({ ownerId: identityKey, value: "" });
  const input = inputState.ownerId === identityKey ? inputState.value : "";
  const setInput = (update: string | ((current: string) => string)) => setInputState((previous) => {
    const current = previous.ownerId === identityRef.current ? previous.value : "";
    return { ownerId: identityRef.current, value: typeof update === "function" ? update(current) : update };
  });
  const faqRequestRef = useRef<Promise<void> | null>(null);
  const sendLockRef = useRef(false);
  const guestCookieReadyRef = useRef(false);
  const pendingAskRef = useRef<{ identity: string | null; question: string; sessionKey: string; operationId: string; localMessageId: string } | null>(null);
  const ticketOperationLockRef = useRef(false);
  const statusRefreshLocksRef = useRef(new Set<string>());
  const [statusRefreshingId, setStatusRefreshingId] = useState<string | null>(null);
  const ticketOperationIdentityRef = useRef<string | null>(identityKey);
  const handoffDraftSaveLocksRef = useRef(new Set<string>());
  const feedbackSaveLocksRef = useRef(new Set<string>());
  const [sending, setSending] = useState(false);
  const [creatingTicketFor, setCreatingTicketFor] = useState<string | null>(null);
  const [savingHandoffDraftFor, setSavingHandoffDraftFor] = useState<string | null>(null);
  // Full-screen toggle for the merged widget — resets to the normal
  // bottom-right panel whenever the widget is closed (its only setOpen(false)
  // call site clears this too), so reopening never surprises the user with a
  // full-screen panel they didn't ask for that time.
  const [expanded, setExpanded] = useState(false);
  // Drag-to-resize the left conversation list against the right chat pane —
  // only meaningful in the full-screen layout (the normal 640px popup has no
  // room to spare). Plain pointer events, no drag library: grab the divider,
  // track pointermove on the window (not the divider itself, so the drag
  // keeps tracking even once the pointer leaves the thin handle), release on
  // pointerup. ponytail: fixed px bounds rather than viewport-relative ones —
  // expanded mode is a desktop-sized surface in practice; revisit if that stops being true.
  const SIDEBAR_MIN_PX = 220;
  const SIDEBAR_MAX_PX = 480;
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const resizingRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  function startSidebarResize(event: React.PointerEvent) {
    event.preventDefault();
    resizingRef.current = true;
    const startX = event.clientX;
    const startWidth = sidebarWidth;

    function onMove(moveEvent: PointerEvent) {
      if (!resizingRef.current) return;
      const next = Math.min(SIDEBAR_MAX_PX, Math.max(SIDEBAR_MIN_PX, startWidth + (moveEvent.clientX - startX)));
      setSidebarWidth(next);
    }
    function onUp() {
      resizingRef.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // FAQ shortcuts: category chips -> question list -> tap to ask. Loaded
  // lazily the first time the panel is opened (undefined = never fetched,
  // null = fetch failed), so the widget's normal open/close costs nothing
  // extra for users who never touch it.
  const [faq, setFaq] = useState<FaqCategory[] | null | undefined>(undefined);
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqCategory, setFaqCategory] = useState<string | null>(null);
  const [faqQuestionPage, setFaqQuestionPage] = useState<{ category: string; data: FaqQuestionPage } | null>(null);
  const [faqPage, setFaqPage] = useState(1);
  const [faqPageLoading, setFaqPageLoading] = useState(false);
  const [faqPageError, setFaqPageError] = useState(false);
  const faqPageRequestIdRef = useRef(0);
  const faqPageAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (authLoading) return;
    identityRef.current = identityKey;
    sendLockRef.current = false;
    guestCookieReadyRef.current = false;
    pendingAskRef.current = null;
    ticketOperationLockRef.current = false;
    ticketOperationIdentityRef.current = identityKey;
    const ownerId = identityKey;
    queueMicrotask(() => {
      if (identityRef.current !== ownerId) return;
      try {
        const ownedSessionKey = window.localStorage.getItem(chatbotSessionStorageKey(ownerId));
        setStoredSession({ ownerId, value: ownedSessionKey });
        if (ownerId && !ownedSessionKey) {
          const guestKey = window.localStorage.getItem(chatbotSessionStorageKey(null));
          setGuestClaimCandidate(guestKey ? { ownerId, sessionKey: guestKey } : null);
        } else {
          setGuestClaimCandidate(null);
        }
      } catch {
        setStoredSession({ ownerId, value: null });
        setGuestClaimCandidate(null);
      }
      setSending(false);
      setCreatingTicketFor(null);
      setGuestClaiming(false);
      setGuestClaimError(null);
    });
  }, [authLoading, identityKey]);

  async function claimGuestConversation() {
    const candidate = guestClaimCandidate;
    if (!candidate || candidate.ownerId !== identityRef.current || guestClaiming) return;
    setGuestClaiming(true);
    setGuestClaimError(null);
    try {
      const response = await fetch('/api/chatbot/session/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey: candidate.sessionKey }),
      });
      const result = await response.json().catch(() => ({})) as { data?: { sessionKey?: string }; error?: { code?: string } };
      if (identityRef.current !== candidate.ownerId) return;
      if (!response.ok || result.data?.sessionKey !== candidate.sessionKey) {
        setGuestClaimError(result.error?.code ? supportError(result.error.code).key : 'unavailable');
        return;
      }
      try {
        window.localStorage.setItem(chatbotSessionStorageKey(candidate.ownerId), candidate.sessionKey);
        window.localStorage.removeItem(chatbotSessionStorageKey(null));
      } catch {
        // Keep the guest key if possible; the authenticated session can still continue in memory.
      }
      historyLoadedRef.current = null;
      setHistoryCursor(null);
      setHistoryError(false);
      setMessageState({ ownerId: candidate.ownerId, value: [] });
      setStoredSession({ ownerId: candidate.ownerId, value: candidate.sessionKey });
      setGuestClaimCandidate(null);
    } catch {
      if (identityRef.current === candidate.ownerId) setGuestClaimError('unavailable');
    } finally {
      if (identityRef.current === candidate.ownerId) setGuestClaiming(false);
    }
  }

  function startNewGuestConversation() {
    if (!guestRecoverySessionKey || guestRecoverySessionKey !== sessionKey) return;
    const nextSessionKey = crypto.randomUUID();
    try {
      window.localStorage.setItem(chatbotSessionStorageKey(identityRef.current), nextSessionKey);
    } catch {
      setMessages((current) => [...current, { role: 'bot', text: t('chatbot.somethingWrong') }]);
      return;
    }
    historyAbortRef.current?.abort();
    historyLoadedRef.current = null;
    setHistoryCursor(null);
    setHistoryError(false);
    setMessages([]);
    setInput('');
    setStoredSession({ ownerId: identityRef.current, value: nextSessionKey });
    freshGuestSessionRef.current = nextSessionKey;
    setGuestRecoverySessionKey(null);
    guestCookieReadyRef.current = false;
  }

  async function loadChatHistory(targetSessionKey: string, cursor?: ChatHistoryCursor) {
    const requestIdentity = identityRef.current;
    const requestKey = `${requestIdentity ?? "guest"}:${targetSessionKey}:${cursor?.createdAt ?? ""}:${cursor?.id ?? ""}`;
    if (historyRequestKeyRef.current === requestKey) return;
    historyAbortRef.current?.abort();
    historyRequestKeyRef.current = requestKey;
    setHistoryLoading(true);
    const controller = new AbortController();
    historyAbortRef.current = controller;
    try {
      const response = await fetch("/api/chatbot/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey: targetSessionKey, beforeCreatedAt: cursor?.createdAt, beforeId: cursor?.id }),
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({})) as {
        error?: { code?: string } | null;
        data?: {
          messages: Array<{ id: string; role: "user" | "bot"; text: string; question?: string; feedbackStage?: FeedbackStage; evidence?: ChatMessage["evidence"] }>;
          nextCursor: ChatHistoryCursor | null;
        };
      };
      if (!response.ok || !result.data || identityRef.current !== requestIdentity || sessionKey !== targetSessionKey) {
        if (!response.ok && identityRef.current === requestIdentity && sessionKey === targetSessionKey && requestIdentity === null
            && (response.status === 404 || result.error?.code === 'NOT_FOUND'
              || result.error?.code === 'UNAUTHORIZED' || result.error?.code === 'GUEST_SESSION_REQUIRED')) {
          setGuestRecoverySessionKey(targetSessionKey);
        }
        if (!controller.signal.aborted && identityRef.current === requestIdentity) setHistoryError(true);
        return;
      }
      const restored = result.data.messages.map((item): ChatMessage => ({
        role: item.role,
        text: item.text,
        persistedId: item.id,
        messageId: item.role === "bot" ? item.id : undefined,
        question: item.question,
        feedbackStage: item.feedbackStage,
        evidence: item.evidence,
        handoffOperationId: item.role === "bot" ? readPendingSupportOperation(identityKey, item.id) ?? undefined : undefined,
        ticketOperationUnknown: item.role === "bot" ? Boolean(readPendingSupportOperation(identityKey, item.id)) : false,
      }));
      if (cursor) {
        setMessages((current) => {
          const existingIds = new Set(current.map((item) => item.persistedId).filter((id): id is string => Boolean(id)));
          return [...restored.filter((item) => !item.persistedId || !existingIds.has(item.persistedId)), ...current];
        });
      } else {
        setMessages((current) => {
          if (!current.length) return restored;
          const restoredById = new Map(restored.filter((item) => item.persistedId).map((item) => [item.persistedId, item]));
          const existingIds = new Set(current.map((item) => item.persistedId).filter((id): id is string => Boolean(id)));
          const reconciled = current.map((item) => item.persistedId ? restoredById.get(item.persistedId) ?? item : item);
          return [...reconciled, ...restored.filter((item) => item.persistedId && !existingIds.has(item.persistedId))];
        });
      }
      setHistoryCursor(result.data.nextCursor);
      setHistoryError(false);
      setGuestRecoverySessionKey(null);
      historyLoadedRef.current = `${requestIdentity ?? "guest"}:${targetSessionKey}`;
    } catch {
      if (!controller.signal.aborted && identityRef.current === requestIdentity) setHistoryError(true);
    } finally {
      if (historyAbortRef.current === controller) {
        historyAbortRef.current = null;
        historyRequestKeyRef.current = null;
        setHistoryLoading(false);
      }
    }
  }

  useEffect(() => {
    if (authLoading || !identityKey || !open || selected?.kind !== "support" || !sessionKey) return;
    const historyKey = `${identityKey}:${sessionKey}`;
    if (historyLoadedRef.current === historyKey) return;
    void loadChatHistory(sessionKey);
  // Guest transcripts stay hidden until sign-in and explicit claim.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, identityKey, open, selected?.kind, sessionKey]);

  useEffect(() => () => historyAbortRef.current?.abort(), [identityKey, sessionKey]);

  useEffect(() => {
    const isSupportPaneOpen = open && selected?.kind === "support";
    if (!isSupportPaneOpen) {
      supportPaneWasOpenRef.current = false;
      return;
    }
    const reopened = !supportPaneWasOpenRef.current;
    supportPaneWasOpenRef.current = true;
    const historyKey = `${identityKey ?? "guest"}:${sessionKey ?? ""}`;
    if (reopened && identityKey && sessionKey
        && historyLoadedRef.current === historyKey && Date.now() - historyRefreshAtRef.current >= 5000) {
      historyRefreshAtRef.current = Date.now();
      void loadChatHistory(sessionKey);
    }
  // Reconcile the bounded first history page when the support pane is reopened.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityKey, open, selected?.kind, sessionKey]);

  useEffect(() => {
    if (!identityKey || !open || selected?.kind !== "support" || !sessionKey) return;
    const refreshOnReturn = () => {
      if (document.visibilityState !== "visible"
          || Date.now() - historyRefreshAtRef.current < 5000) return;
      historyRefreshAtRef.current = Date.now();
      void loadChatHistory(sessionKey);
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => document.removeEventListener("visibilitychange", refreshOnReturn);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, open, selected?.kind, sessionKey]);

  async function loadFaq() {
    if (faqRequestRef.current) return faqRequestRef.current;
    const request = (async () => {
      try {
        const res = await fetch("/api/chatbot/faq");
        const body = (await res.json()) as { data: { categories: FaqCategory[] } | null };
        setFaq(res.ok && body.data ? body.data.categories : null);
      } catch {
        setFaq(null);
      }
    })();
    faqRequestRef.current = request;
    try {
      await request;
    } finally {
      faqRequestRef.current = null;
    }
  }

  async function loadFaqQuestions(category: string, page: number) {
    const requestId = ++faqPageRequestIdRef.current;
    faqPageAbortRef.current?.abort();
    const controller = new AbortController();
    faqPageAbortRef.current = controller;
    setFaqPage(page);
    setFaqPageLoading(true);
    setFaqPageError(false);
    try {
      const params = new URLSearchParams({ category, page: String(page) });
      const res = await fetch(`/api/chatbot/faq?${params}`, { signal: controller.signal });
      const body = (await res.json().catch(() => ({}))) as { data?: FaqQuestionPage | null };
      if (!res.ok || !body.data) throw new Error("faq_page_unavailable");
      if (requestId !== faqPageRequestIdRef.current) return;
      setFaqQuestionPage({ category, data: body.data });
      setFaqPage(body.data.page);
    } catch {
      if (controller.signal.aborted || requestId !== faqPageRequestIdRef.current) return;
      setFaqPageError(true);
    } finally {
      if (requestId === faqPageRequestIdRef.current) setFaqPageLoading(false);
    }
  }

  function openFaqCategory(category: string) {
    setFaqCategory(category);
    setFaqPage(1);
    void loadFaqQuestions(category, 1);
  }

  function returnToFaqCategories() {
    faqPageAbortRef.current?.abort();
    faqPageRequestIdRef.current += 1;
    setFaqPageLoading(false);
    setFaqPageError(false);
    setFaqCategory(null);
  }

  function toggleFaq() {
    setFaqOpen((wasOpen) => {
      if (!wasOpen && (faq === undefined || faq === null)) void loadFaq();
      if (wasOpen) returnToFaqCategories(); // reset to the category list for next time
      return !wasOpen;
    });
  }

  useEffect(() => {
    // Also depends on `selected`: the message list div only exists in the DOM
    // while the Support pane is the one showing (conditionally rendered), so
    // switching to a vendor thread and back remounts it at scroll position 0
    // (oldest message) — this re-fires on that remount too, not just on new
    // messages, so reselecting Support always lands back at the latest one.
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, selected]);

  // CLAUDE-VOICE-INPUT.md Part 2: "current language" = the most recent bot
  // reply's detected language (the only per-conversation language signal
  // this widget already tracks — see the file header's trilingual note),
  // falling back to English before any reply has arrived.
  const currentLanguage = useMemo<ChatLanguage>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "bot" && m.language) return m.language;
    }
    return "en";
  }, [messages]);
  // Populate the input directly from the hook's onTranscriptChange callback
  // (fires only while a real recognition result comes in) rather than a
  // useEffect watching the returned transcript value — the idiomatic fix,
  // see that option's doc comment in hooks/use-speech-input.ts. This also
  // means the user's own typed edits after stopping are never at risk of
  // being clobbered by a stray effect re-run.
  const speech = useSpeechInput({ lang: resolveRecognitionLang(currentLanguage), onTranscriptChange: setInput });

  function presentCustomerStatus(
    localId: string,
    kind: CustomerStatusKind,
    question: string,
    result: Awaited<ReturnType<typeof fetchCustomerStatus>>,
    append: boolean,
  ) {
    const signInRequired = result.signInRequired;
    const items = result.ok && result.data?.state === "available" ? result.data.items ?? [] : [];
    const actions = result.data?.actions ?? (result.ok ? [] : ["refresh_status", "open_record", "handoff"] as const);
    const unconfirmed = items.some((item) => item.actions.includes("refresh_status"));
    const hasKnownResult = result.data?.state === "available" || result.data?.state === "no_records";
    const needsHumanHelp = signInRequired || !result.ok || !hasKnownResult || unconfirmed;
    const shouldOfferHuman = !signInRequired && (needsHumanHelp || result.data?.state === "no_records");
    const message = signInRequired
      ? t("chatbot.statusQuery.signIn")
      : needsHumanHelp
        ? t("chatbot.statusQuery.unavailable")
        : result.data?.state === "available"
          ? t("chatbot.statusQuery.found")
          : result.data?.state === "no_records"
            ? t("chatbot.statusQuery.none")
            : t("chatbot.statusQuery.unavailable");
    const pageHref = customerStatusPage(kind);
    const statusMessage: ChatMessage = {
      role: "bot",
      localId,
      text: message,
      statusKind: kind,
      statusActions: actions,
      statusItems: items.length ? items : undefined,
      statusRetryAvailable: !signInRequired && actions.includes("refresh_status"),
      question: shouldOfferHuman && actions.includes("handoff") ? question : undefined,
      feedbackStage: shouldOfferHuman && actions.includes("handoff") ? "awaiting_ticket" : undefined,
      statusActionHref: signInRequired ? `/login?next=${encodeURIComponent(pageHref)}` : actions.includes("open_record") ? pageHref : undefined,
      statusActionLabel: signInRequired ? t("chatbot.statusQuery.signInAction") : actions.includes("open_record") ? t("chatbot.statusQuery.openRecord") : undefined,
    };
    setMessages((current) => append
      ? [...current, statusMessage]
      : current.map((item) => item.localId === localId ? statusMessage : item));
  }

  async function refreshCustomerStatus(localId: string, kind: CustomerStatusKind, question: string) {
    if (statusRefreshLocksRef.current.has(localId)) return;
    statusRefreshLocksRef.current.add(localId);
    const requestIdentity = identityRef.current;
    setStatusRefreshingId(localId);
    try {
      const result = await fetchCustomerStatus(kind);
      if (identityRef.current !== requestIdentity) return;
      presentCustomerStatus(localId, kind, question, result, false);
    } finally {
      statusRefreshLocksRef.current.delete(localId);
      setStatusRefreshingId((current) => current === localId ? null : current);
    }
  }

  /**
   * `explicitQuestion` is the FAQ path — an exact, curated KB question the
   * user tapped, sent as-is. The typed path (no argument) reads and clears
   * the composer as before; a FAQ tap deliberately leaves whatever the user
   * had typed untouched, since it never came from the composer.
   */
  async function sendMessage(explicitQuestion?: string) {
    const question = (explicitQuestion ?? input).trim();
    if (!question || sending || sendLockRef.current || guestClaimCandidate?.ownerId === identityRef.current) return;
    sendLockRef.current = true;
    const requestIdentity = identityRef.current;
    setSending(true);
    const statusIntent = resolveCustomerSupportIntent(question);
    const retryingAsk = !statusIntent && pendingAskRef.current?.identity === requestIdentity && pendingAskRef.current.question === question
      ? pendingAskRef.current
      : null;
    const localMessageId = retryingAsk?.localMessageId ?? crypto.randomUUID();
    if (!retryingAsk) setMessages((m) => [...m, { role: "user", text: question, localId: localMessageId }]);

    try {
      if (statusIntent) {
        const statusLocalId = crypto.randomUUID();
        const result = await fetchCustomerStatus(statusIntent);
        if (identityRef.current !== requestIdentity) return;
        presentCustomerStatus(statusLocalId, statusIntent, question, result, true);
        if (explicitQuestion === undefined) setInput((current) => current === question ? "" : current);
        return;
      }

      let targetSessionKey = sessionKey;
      if (!targetSessionKey) {
        targetSessionKey = crypto.randomUUID();
        if (!requestIdentity) freshGuestSessionRef.current = targetSessionKey;
        try {
          window.localStorage.setItem(chatbotSessionStorageKey(requestIdentity), targetSessionKey);
        } catch {
          setMessages((m) => [...m, { role: "bot", text: t("chatbot.somethingWrong") }]);
          return;
        }
        setSessionKey(targetSessionKey);
      }
      let pendingAsk = retryingAsk;
      if (!pendingAsk || pendingAsk.identity !== requestIdentity || pendingAsk.question !== question || pendingAsk.sessionKey !== targetSessionKey) {
        pendingAsk = {
          identity: requestIdentity,
          question,
          sessionKey: targetSessionKey,
          operationId: readPendingAskOperation(targetSessionKey) ?? crypto.randomUUID(),
          localMessageId,
        };
      }
      if (!storePendingAskOperation(targetSessionKey, pendingAsk.operationId)) {
        setMessages((m) => [...m, { role: "bot", text: t("chatbot.somethingWrong") }]);
        return;
      }
      pendingAskRef.current = pendingAsk;
      if (!requestIdentity && !guestCookieReadyRef.current) {
        const cookieResponse = await fetch('/api/chatbot/session/guest-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionKey: targetSessionKey }),
        });
        const cookieResult = await cookieResponse.json().catch(() => ({})) as { error?: { code?: string } };
        if (identityRef.current !== requestIdentity) return;
        if (!cookieResponse.ok) {
          if (cookieResult.error?.code === 'GUEST_SESSION_REQUIRED') {
            setHistoryError(true);
            setGuestRecoverySessionKey(targetSessionKey);
            setMessages((m) => [...m, { role: 'bot', text: t('chatbot.guestSessionUnavailable') }]);
          } else if (cookieResult.error?.code === 'READ_UNAVAILABLE') {
            setMessages((m) => [...m, { role: 'bot', text: t('chatbot.sessionUnavailable') }]);
          } else if (cookieResult.error?.code === 'AUTH_UNAVAILABLE') {
            setMessages((m) => [...m, { role: 'bot', text: t('chatbot.authUnavailable') }]);
          } else {
            setMessages((m) => [...m, { role: 'bot', text: t('chatbot.somethingWrong') }]);
          }
          return;
        }
        guestCookieReadyRef.current = true;
      }
      const createAskRequest = (operationId: string) => fetch("/api/chatbot/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey: targetSessionKey, operationId, question }),
      });
      let res = await createAskRequest(pendingAsk.operationId);
      let body = (await res.json()) as {
        data: { sessionKey: string; answer: string; botAnswered: boolean; messageId: string; userMessageId: string; language: ChatLanguage; privacyBlocked: boolean; evidence?: ChatMessage["evidence"] } | null;
        error: { code?: string; message: string } | null;
      };
      if (!res.ok && body.error?.code === "OPERATION_CONFLICT") {
        // A persisted operation ID may outlive the question it originally guarded.
        // The server rejected this payload before any model call, so retry once with a fresh ID.
        const renewedOperationId = crypto.randomUUID();
        if (storePendingAskOperation(targetSessionKey, renewedOperationId)) {
          pendingAsk = { ...pendingAsk, operationId: renewedOperationId };
          pendingAskRef.current = pendingAsk;
          res = await createAskRequest(renewedOperationId);
          body = (await res.json()) as typeof body;
        }
      }
      if (identityRef.current !== requestIdentity) return;
      if (!res.ok || !body.data) {
        if (body.error?.code === "OPERATION_UNKNOWN") {
          setMessages((m) => [...m, { role: "bot", text: t("chatbot.askResultUnknown") }]);
        } else if (body.error?.code === "AUTH_UNAVAILABLE") {
          setMessages((m) => [...m, { role: "bot", text: t("chatbot.authUnavailable") }]);
        } else if (body.error?.code === "SESSION_UNAVAILABLE") {
          setMessages((m) => [...m, { role: "bot", text: t("chatbot.sessionUnavailable") }]);
        } else if (body.error?.code === "OPERATION_CONFLICT") {
          storePendingAskOperation(targetSessionKey, null);
          pendingAskRef.current = null;
          setMessages((m) => [...m, { role: "bot", text: t("chatbot.askOperationConflict") }]);
        } else if (body.error?.code === "GUEST_SESSION_REQUIRED") {
          guestCookieReadyRef.current = false;
          if (!requestIdentity) {
            setHistoryError(true);
            setGuestRecoverySessionKey(targetSessionKey);
          }
          setMessages((m) => [...m, { role: "bot", text: t("chatbot.guestCookieUnavailable") }]);
        } else {
          setMessages((m) => [...m, { role: "bot", text: t("chatbot.somethingWrong") }]);
        }
        return;
      }
      pendingAskRef.current = null;
      storePendingAskOperation(targetSessionKey, null);
      if (!requestIdentity && freshGuestSessionRef.current === targetSessionKey) {
        freshGuestSessionRef.current = null;
        historyLoadedRef.current = `guest:${targetSessionKey}`;
      }
      setHistoryError(false);
      setGuestRecoverySessionKey(null);
      const { answer, botAnswered, messageId, userMessageId, language, privacyBlocked, evidence } = body.data;
      if (explicitQuestion === undefined) setInput((current) => current === question ? "" : current);
      let effectiveSessionKey = sessionKey;
      if (body.data.sessionKey && body.data.sessionKey !== sessionKey) {
        effectiveSessionKey = body.data.sessionKey;
        setSessionKey(body.data.sessionKey);
        try {
          window.localStorage.setItem(chatbotSessionStorageKey(requestIdentity), body.data.sessionKey);
        } catch {
          // The key was saved before the request; the server response remains usable.
        }
      }

      setMessages((m) => [...m.map((message) => message.localId === localMessageId ? { ...message, localId: undefined, persistedId: userMessageId } : message), createBotMessage({ text: answer, messageId, language, privacyBlocked, evidence, botAnswered }, question)]);

      // Flow 2: the bot already knows it didn't help — there's no yes/no
      // helpfulness question to ask, so this is recorded automatically
      // rather than waiting on a click that will never come. helpful stays
      // null (not false): null means "never asked", which is what actually
      // happened here — the couldn't-answer signal is bot_answered=false
      // on its own, distinct from a real thumbs-down on a real answer.
      if (!botAnswered) {
        postFeedback({ sessionKey: effectiveSessionKey ?? undefined, messageId, question, botAnswered: false, helpful: null });
      }
    } catch {
      if (identityRef.current === requestIdentity) setMessages((m) => [...m, { role: "bot", text: t("chatbot.somethingWrong") }]);
    } finally {
      if (identityRef.current === requestIdentity) {
        sendLockRef.current = false;
        setSending(false);
      }
    }
  }

  function submitHelpful(index: number, helpful: boolean) {
    const msg = messages[index];
    if (!msg?.messageId || feedbackSaveLocksRef.current.has(msg.messageId)) return;
    feedbackSaveLocksRef.current.add(msg.messageId);
    setMessages((prev) => prev.map((item) => (item.messageId === msg.messageId
      ? { ...item, feedbackSaving: true, feedbackSaveFailed: false, feedbackVote: helpful, feedbackStage: helpful ? "awaiting_helpful" : "awaiting_ticket" }
      : item)));
    void postFeedback({ sessionKey: sessionKey ?? undefined, messageId: msg.messageId, question: msg.question, botAnswered: true, helpful })
      .then((result) => {
        feedbackSaveLocksRef.current.delete(msg.messageId!);
        const feedbackLoginHref = result.requiresSignIn
          ? `/login?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`
          : undefined;
        setMessages((prev) => prev.map((item) => (item.messageId === msg.messageId
          ? {
            ...item,
            feedbackSaving: false,
            feedbackSaveFailed: !result.saved,
            feedbackNeedsSignIn: !result.saved && result.requiresSignIn,
            feedbackLoginHref: !result.saved ? feedbackLoginHref : undefined,
            feedbackVote: result.saved ? undefined : helpful,
            feedbackStage: helpful ? (result.saved ? "helpful_done" : "awaiting_helpful") : "awaiting_ticket",
          }
          : item)));
      });
  }

  function declineTicket(index: number) {
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, feedbackStage: "ticket_declined" } : m)));
  }

  async function cancelHandoffPreview(index: number) {
    const message = messages[index];
    if (!message || message.feedbackStage !== "handoff_preview") return;
    const hasUnsavedEdits = !message.handoffDraftSaved && (
      (message.handoffSubject ?? "") !== (message.handoffPreviewSubject ?? "")
      || (message.handoffSummary ?? "") !== (message.handoffPreviewSummary ?? "")
    );
    if (hasUnsavedEdits && !(await confirm(t("chatbot.handoff.discardUnsavedConfirm")))) return;
    setMessages((prev) => prev.map((item, itemIndex) => itemIndex === index
      ? { ...item, feedbackStage: "ticket_declined", ticketError: undefined }
      : item));
  }

  async function createTicket(index: number) {
    const msg = messages[index];
    if (!msg.question || creatingTicketFor || ticketOperationLockRef.current) return;
    const requestIdentity = identityRef.current;
    ticketOperationLockRef.current = true;
    ticketOperationIdentityRef.current = requestIdentity;
    const pendingOperationId = readPendingSupportOperation(currentUser?.id ?? null, msg.messageId);
    const operationId = pendingOperationId ?? crypto.randomUUID();
    const hasPendingOperation = Boolean(pendingOperationId);
    const draftTarget = msg.messageId ?? msg.handoffDraftTarget ?? operationId;
    setCreatingTicketFor(msg.messageId ?? operationId);
    setMessages((prev) => prev.map((item, itemIndex) => itemIndex === index
      ? { ...item, ticketError: undefined, ticketErrorCode: undefined, ticketNeedsSignIn: false, handoffDraftLoadFailed: false }
      : item));
    try {
      let subject = resolveTicketSubject(msg.question, t("chatbot.supportRequest"));
      let summary = msg.question;
      let draftVersion = 0;
      if (currentUser) {
        const draftResponse = await fetch(`/api/support/drafts?surface=handoff&target=${encodeURIComponent(draftTarget)}`, { cache: "no-store" }).catch(() => null);
        if (identityRef.current !== requestIdentity) return;
        if (draftResponse?.status === 401) {
          setMessages((prev) => prev.map((item, itemIndex) => itemIndex === index
            ? { ...item, ticketErrorCode: "UNAUTHORIZED", ticketNeedsSignIn: true, handoffDraftLoadFailed: true }
            : item));
          return;
        }
        if (!draftResponse?.ok) {
          setMessages((prev) => prev.map((item, itemIndex) => itemIndex === index
            ? { ...item, handoffDraftLoadFailed: true }
            : item));
          return;
        }
        const draftResult = await draftResponse.json().catch(() => null) as { data?: { subject?: unknown; body?: unknown; version?: unknown } } | null;
        if (identityRef.current !== requestIdentity) return;
        const draft = draftResult?.data;
        if (!draft || typeof draft.subject !== "string" || typeof draft.body !== "string"
          || typeof draft.version !== "number" || !Number.isInteger(draft.version) || draft.version < 0) {
          setMessages((prev) => prev.map((item, itemIndex) => itemIndex === index
            ? { ...item, handoffDraftLoadFailed: true }
            : item));
          return;
        }
        if (draft.version > 0) {
          subject = draft.subject;
          summary = draft.body;
          draftVersion = draft.version;
        }
      }
      if (identityRef.current !== requestIdentity) return;
      setMessages((prev) => prev.map((m, i) => (i === index ? {
        ...m,
        feedbackStage: "handoff_preview",
        handoffSubject: subject,
        handoffSummary: summary,
        handoffPreviewSubject: subject,
        handoffPreviewSummary: summary,
        handoffSourceMessage: msg.messageId ? msg.question ?? null : null,
        handoffOperationId: operationId,
        handoffDraftTarget: draftTarget,
        handoffDraftVersion: draftVersion,
        handoffDraftSaved: draftVersion > 0,
        handoffDraftLoadFailed: false,
        ticketOperationUnknown: hasPendingOperation,
        ticketError: undefined,
      } : m)));
    } catch {
      if (identityRef.current === requestIdentity) {
        setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, ticketError: t("chatbot.ticketError") } : m)));
      }
    } finally {
      if (ticketOperationIdentityRef.current === requestIdentity) {
        ticketOperationLockRef.current = false;
        setCreatingTicketFor(null);
      }
    }
  }

  async function saveHandoffDraft(index: number): Promise<boolean> {
    const msg = messages[index];
    if (!msg.handoffOperationId) return false;
    if (!currentUser) {
      setMessages((prev) => prev.map((item, itemIndex) => itemIndex === index
        ? { ...item, ticketError: t("chatbot.ticketError"), ticketErrorCode: "UNAUTHORIZED", ticketNeedsSignIn: true }
        : item));
      return false;
    }
    const draftTarget = msg.messageId ?? msg.handoffDraftTarget ?? msg.handoffOperationId;
    const saveLockKey = `${currentUser.id}:${draftTarget}`;
    if (handoffDraftSaveLocksRef.current.has(saveLockKey)) return false;
    handoffDraftSaveLocksRef.current.add(saveLockKey);
    setSavingHandoffDraftFor(saveLockKey);
    const requestIdentity = identityRef.current;
    const subject = msg.handoffSubject ?? "";
    const body = msg.handoffSummary ?? "";
    const expectedVersion = msg.handoffDraftVersion ?? 0;
    setMessages((prev) => prev.map((item, itemIndex) => itemIndex === index
      ? { ...item, ticketError: undefined, ticketErrorCode: undefined, ticketNeedsSignIn: false }
      : item));
    try {
      const response = await fetch("/api/support/drafts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface: "handoff", target: draftTarget, subject, body, expectedVersion }),
      }).catch(() => null);
      if (identityRef.current !== requestIdentity) return false;
      const result = await response?.json().catch(() => ({})) as { data?: { version?: number; changed?: boolean } } | undefined;
      if (identityRef.current !== requestIdentity) return false;
      if (!response?.ok || typeof result?.data?.version !== "number") {
        const needsSignIn = response?.status === 401;
        setMessages((prev) => prev.map((item, itemIndex) => itemIndex === index
          ? {
            ...item,
            handoffDraftSaved: false,
            ticketError: needsSignIn ? undefined : t("chatbot.handoff.draftSaveFailed"),
            ticketErrorCode: needsSignIn ? "UNAUTHORIZED" : undefined,
            ticketNeedsSignIn: needsSignIn,
          }
          : item));
        return false;
      }
      setMessages((prev) => prev.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        const contentUnchanged = item.handoffSubject === subject
          && item.handoffSummary === body
          && (item.handoffDraftVersion ?? 0) === expectedVersion;
        return {
          ...item,
          handoffDraftVersion: result.data!.version,
          handoffDraftSaved: contentUnchanged,
          ticketError: undefined,
          ticketErrorCode: undefined,
          ticketNeedsSignIn: false,
        };
      }));
      return true;
    } finally {
      handoffDraftSaveLocksRef.current.delete(saveLockKey);
      setSavingHandoffDraftFor((current) => current === saveLockKey ? null : current);
    }
  }

  async function confirmTicket(index: number) {
    const msg = messages[index];
    if (!msg.handoffOperationId || creatingTicketFor || ticketOperationLockRef.current) return;
    if (!msg.handoffConsented) return;
    const requestIdentity = identityRef.current;
    const subject = msg.handoffSubject?.trim() ?? "";
    const summary = msg.handoffSummary?.trim() ?? "";
    if (!subject || subject.length > 255 || !summary || summary.length > 2000) {
      setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, ticketError: t("chatbot.handoff.invalid") } : m)));
      return;
    }
    ticketOperationLockRef.current = true;
    ticketOperationIdentityRef.current = requestIdentity;
    setCreatingTicketFor(msg.messageId ?? msg.handoffOperationId);
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, ticketError: undefined, ticketNeedsSignIn: false } : m)));

    try {
      if (!(await saveHandoffDraft(index))) return;
      const previewResponse = await fetch("/api/support/handoff/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, summary, sessionKey: sessionKey ?? undefined, messageId: msg.messageId }),
      }).catch(() => null);
      const previewResult = await previewResponse?.json().catch(() => ({})) as { data?: { subject: string; summary: string; handoffToken: string; sourceMessageId?: string | null; sourceMessage?: string | null }; error?: { code?: string } } | undefined;
      if (identityRef.current !== requestIdentity) return;
      if (!previewResponse?.ok || !previewResult?.data) {
        setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, ticketError: t("chatbot.ticketError"), ticketErrorCode: previewResult?.error?.code ?? "PREVIEW_UNAVAILABLE", ticketNeedsSignIn: previewResponse?.status === 401 } : m)));
        return;
      }
      if (previewResult.data.subject !== subject || previewResult.data.summary !== summary
        || (previewResult.data.sourceMessageId && previewResult.data.sourceMessage !== msg.handoffSourceMessage)) {
        setMessages((prev) => prev.map((m, i) => (i === index ? {
          ...m,
          handoffSubject: previewResult.data!.subject,
          handoffSummary: previewResult.data!.summary,
          handoffSourceMessage: previewResult.data!.sourceMessage ?? null,
          handoffPreviewSubject: previewResult.data!.subject,
          handoffPreviewSummary: previewResult.data!.summary,
          handoffConsented: false,
          ticketError: t("chatbot.handoff.cleanedReview"),
        } : m)));
        return;
      }
      if (currentUser && msg.messageId) storePendingSupportOperation(currentUser.id, msg.messageId, msg.handoffOperationId);
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationId: msg.handoffOperationId,
          handoffToken: previewResult.data.handoffToken,
          consent: true,
          subject,
          body: summary,
          ...(previewResult.data.sourceMessageId ? {
            sourceMessageId: previewResult.data.sourceMessageId,
            sourceMessage: previewResult.data.sourceMessage ?? undefined,
          } : {}),
        }),
      });
      const result = (await res.json().catch(() => ({}))) as { data?: { id: string; category: string } | null; error?: { code?: string } | null };
      if (identityRef.current !== requestIdentity) return;
      const ticketErrorText = t("chatbot.ticketError");
      if (res.ok && result.data) {
        setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, feedbackStage: "ticket_created", ticketId: result.data!.id, ticketOperationUnknown: false, ticketOperationNotFound: false } : m)));
        const draftTarget = msg.messageId ?? msg.handoffDraftTarget ?? msg.handoffOperationId;
        if (currentUser && draftTarget) {
          void fetch(`/api/support/drafts?surface=handoff&target=${encodeURIComponent(draftTarget)}`, { method: "DELETE" });
        }
        if (msg.messageId && sessionKey) postFeedback({ sessionKey, messageId: msg.messageId, openedTicket: true });
      } else {
        setMessages((prev) => prev.map((m, i) => (i === index ? {
          ...m,
          ticketError: ticketErrorText,
          ticketErrorCode: result.error?.code,
          ticketNeedsSignIn: res.status === 401,
          ticketOperationUnknown: res.status >= 500,
        } : m)));
      }
    } catch {
      if (identityRef.current === requestIdentity) setMessages((prev) => prev.map((m, i) => (i === index ? {
        ...m,
        ticketError: t("chatbot.ticketError"),
        ticketNeedsSignIn: false,
        ticketOperationUnknown: true,
      } : m)));
    } finally {
      if (ticketOperationIdentityRef.current === requestIdentity) {
        ticketOperationLockRef.current = false;
        setCreatingTicketFor(null);
      }
    }
  }

  async function checkTicketOperation(index: number) {
    const msg = messages[index];
    if (!msg.handoffOperationId || creatingTicketFor || ticketOperationLockRef.current) return;
    const requestIdentity = identityRef.current;
    ticketOperationLockRef.current = true;
    ticketOperationIdentityRef.current = requestIdentity;
    setCreatingTicketFor(msg.messageId ?? msg.handoffOperationId);
    try {
      const response = await fetch(`/api/support/operations/${msg.handoffOperationId}`);
      const result = await response.json().catch(() => ({})) as { data?: { state?: string; ticketId?: string } };
      if (identityRef.current !== requestIdentity) return;
      if (!response.ok || !result.data) {
        setMessages((current) => current.map((item, itemIndex) => itemIndex === index
          ? { ...item, ticketError: t("chatbot.statusQuery.unavailable") }
          : item));
        return;
      }
      if (result.data.state === "completed" && result.data.ticketId) {
        if (currentUser && msg.messageId) storePendingSupportOperation(currentUser.id, msg.messageId, null);
        setMessages((current) => current.map((item, itemIndex) => itemIndex === index
          ? { ...item, feedbackStage: "ticket_created", ticketId: result.data!.ticketId, ticketOperationUnknown: false, ticketOperationNotFound: false, ticketError: undefined }
          : item));
        if (msg.messageId && sessionKey && currentUser) postFeedback({ sessionKey, messageId: msg.messageId, openedTicket: true });
        return;
      }
      setMessages((current) => current.map((item, itemIndex) => itemIndex === index
        ? { ...item, ticketOperationUnknown: false, ticketOperationNotFound: true, ticketError: t("chatbot.handoff.notCreated") }
        : item));
    } catch {
      if (identityRef.current === requestIdentity) {
        setMessages((current) => current.map((item, itemIndex) => itemIndex === index
          ? { ...item, ticketError: t("chatbot.statusQuery.unavailable") }
          : item));
      }
    } finally {
      if (ticketOperationIdentityRef.current === requestIdentity) {
        ticketOperationLockRef.current = false;
        setCreatingTicketFor(null);
      }
    }
  }

  return (
    <div className={expanded ? "fixed inset-0 z-50 print:hidden" : "fixed bottom-4 right-4 z-50 print:hidden"}>
      {open ? (
        <div
          className={
            expanded
              ? "flex h-full w-full flex-col overflow-hidden border-0 bg-background shadow-xl"
              : "flex w-[640px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
          }
          style={expanded ? undefined : { height: 460, maxHeight: "calc(100vh - 6rem)" }}
        >
          <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <span className="text-sm font-semibold">{t("chatbot.brand")}</span>
            <div className="flex items-center gap-3">
              <Link href="/customer/support" className="text-[0.6875rem] underline opacity-90 hover:opacity-100">
                {t("chatbot.myTickets")}
              </Link>
              <button onClick={() => setExpanded((current) => !current)} aria-label={expanded ? t("chatbot.collapseChat") : t("chatbot.expandChat")}>
                {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
              <button onClick={() => { setOpen(false); setExpanded(false); }} aria-label={t("chatbot.closeChat")}>
                <X size={16} />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1">
            <div className={`min-h-0 min-w-0 ${selected ? "hidden sm:flex sm:flex-none" : "flex flex-1 sm:flex-none"}`}>
              <ChatWidgetInbox currentUserId={currentUser?.id ?? null} selected={selected} onSelect={selectChat} widthPx={expanded ? sidebarWidth : undefined} />
            </div>

            {expanded && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t("chatbot.resizeSidebar")}
                onPointerDown={startSidebarResize}
                className="hidden w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-border/60 transition-colors hover:bg-primary/40 sm:flex"
              >
                <div className="h-8 w-0.5 rounded-full bg-muted-foreground/40" />
              </div>
            )}

            {authLoading ? (
              <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">{t("states.loading")}</div>
            ) : !currentUser ? (
              <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <p className="text-sm font-semibold text-foreground">{t("chatbot.loginRequired.title")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t("chatbot.loginRequired.description")}</p>
                <Button asChild size="sm"><Link href="/login?next=%2Fcustomer%2Fsupport">{t("chatbot.loginRequired.action")}</Link></Button>
              </div>
            ) : selected?.kind === "human-support" ? (
              <ChatWidgetHumanSupport key={currentUser.id} userId={currentUser.id} onBack={() => selectChat(null)} />
            ) : selected?.kind === "vendor" && currentUser ? (
              <ChatWidgetVendorThread threadId={selected.threadId} currentUserId={currentUser.id} onBack={() => selectChat(null)} />
            ) : selected?.kind === "support" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <button onClick={() => selectChat(null)} className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground sm:hidden">
                  <ChevronLeft size={14} /> {t("actions.back")}
                </button>

                {guestClaimCandidate?.ownerId === identityKey && (
                  <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
                    <span className="flex-1 text-xs text-foreground">{t("chatbot.guestClaim.prompt")}</span>
                    <Button type="button" size="sm" className="h-7 px-2.5 text-xs" onClick={() => void claimGuestConversation()} disabled={guestClaiming}>
                      {guestClaiming ? t("chatbot.guestClaim.working") : t("chatbot.guestClaim.continue")}
                    </Button>
                    <button type="button" className="text-xs text-muted-foreground underline" onClick={() => { setGuestClaimCandidate(null); setGuestClaimError(null); }}>
                      {t("chatbot.guestClaim.notNow")}
                    </button>
                  </div>
                )}
                {guestClaimError && guestClaimCandidate?.ownerId === identityKey && (
                  <p role="alert" className="border-b border-border px-3 py-1.5 text-xs text-destructive">
                    {t(`chatbot.supportErrors.${guestClaimError}`)}
                  </p>
                )}

                <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                  {historyCursor && sessionKey && (
                    <Button type="button" size="sm" variant="ghost" className="mx-auto flex h-7 text-xs" onClick={() => void loadChatHistory(sessionKey, historyCursor)} disabled={historyLoading}>
                      {t("chatbot.history.loadEarlier")}
                    </Button>
                  )}
                  {historyError && (
                    <div role="alert" className="flex flex-wrap items-center justify-center gap-2 text-xs text-destructive">
                      <span>{guestRecoverySessionKey === sessionKey ? t("chatbot.guestSessionUnavailable") : t("chatbot.history.unavailable")}</span>
                      {sessionKey && guestRecoverySessionKey !== sessionKey && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => void loadChatHistory(sessionKey)} disabled={historyLoading}>{t("chatbot.faq.retry")}</Button>}
                      {guestRecoverySessionKey === sessionKey && <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={startNewGuestConversation}>{t("chatbot.newConversation")}</Button>}
                    </div>
                  )}
                  {messages.length === 0 && (
                    <div className="mt-8 flex flex-col items-center gap-2.5">
                      <p className="text-xs text-muted-foreground text-center">
                        {t("chatbot.emptyPrompt")}
                      </p>
                      {!faqOpen && (
                        <button
                          type="button"
                          onClick={toggleFaq}
                          className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                        >
                          <HelpCircle size={13} /> {t("chatbot.faq.browse")}
                        </button>
                      )}
                    </div>
                  )}
                  {messages.map((m, i) => {
                    return (
                    <div key={i}>
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
                      >
                        {m.text}
                      </div>
                      {m.role === "bot" && m.privacyBlocked && (
                        <p role="status" className="mt-1 max-w-[85%] rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                          {t("chatbot.privacyBlocked")}
                        </p>
                      )}
                      {m.role === "bot" && m.evidence?.map((source, sourceIndex) => (
                        <p key={`${source.title}-${source.contentVersion}-${sourceIndex}`} className="mt-1 max-w-[85%] px-1 text-[11px] text-muted-foreground">
                          {t("chatbot.evidence", {
                            title: source.title,
                            version: source.contentVersion,
                            checkedAt: new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language ?? "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(source.checkedAt)),
                          })}
                        </p>
                      ))}
                      {m.role === "bot" && m.statusItems && m.statusItems.length > 0 && (
                        <ul className="mt-1.5 max-w-[85%] space-y-1">
                          {m.statusItems.map((item) => (
                            <li key={item.id}>
                              {item.actions.includes("open_record") ? (
                                <Link href={item.href} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-2.5 py-2 text-xs hover:bg-secondary">
                                  <span className="min-w-0 truncate">{item.kind === "withdrawals" || item.kind === "kyc" ? t(`chatbot.statusQuery.records.${item.kind}`) : item.label}</span>
                                  <span className="shrink-0 text-muted-foreground">
                                    {t(`chatbot.statusQuery.values.${item.status.toLowerCase()}`)}
                                  </span>
                                </Link>
                              ) : (
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-2.5 py-2 text-xs">
                                  <span className="min-w-0 truncate">{item.kind === "withdrawals" || item.kind === "kyc" ? t(`chatbot.statusQuery.records.${item.kind}`) : item.label}</span>
                                  <span className="shrink-0 text-muted-foreground">{t(`chatbot.statusQuery.values.${item.status.toLowerCase()}`)}</span>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {m.role === "bot" && m.statusActionHref && m.statusActionLabel && (
                        <Link href={m.statusActionHref} className="mt-1 inline-block text-xs text-primary underline">
                          {m.statusActionLabel}
                        </Link>
                      )}
                      {m.role === "bot" && m.statusRetryAvailable && m.statusKind && m.localId && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-1 h-7 px-2.5 text-xs"
                          disabled={statusRefreshingId === m.localId}
                          onClick={() => void refreshCustomerStatus(m.localId!, m.statusKind!, m.question ?? "")}
                        >
                          {statusRefreshingId === m.localId ? t("chatbot.statusQuery.refreshing") : t("chatbot.statusQuery.retry")}
                        </Button>
                      )}
                      {m.role === "bot" && m.feedbackStage && (
                        <div className="mt-1.5 max-w-[85%]">
                          {m.feedbackSaving && <p role="status" className="mb-1 px-1 text-xs text-muted-foreground">{t("chatbot.feedback.saving")}</p>}
                          {m.feedbackSaveFailed && (
                            <div role="alert" className="mb-1 flex items-center gap-2 rounded-lg border border-destructive/30 bg-background px-2.5 py-1.5">
                              <span className="flex-1 text-xs text-destructive">
                                {m.feedbackNeedsSignIn ? t("chatbot.feedback.signIn") : t("chatbot.feedback.saveFailed")}
                              </span>
                              {m.feedbackNeedsSignIn && m.feedbackLoginHref ? (
                                <Link href={m.feedbackLoginHref} className="text-xs font-medium underline underline-offset-2">
                                  {t("chatbot.feedback.signInAction")}
                                </Link>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 text-xs"
                                  onClick={() => submitHelpful(i, m.feedbackVote ?? true)}
                                  disabled={m.feedbackSaving}
                                >
                                  {t("chatbot.feedback.retry")}
                                </Button>
                              )}
                            </div>
                          )}
                          {m.feedbackStage === "awaiting_helpful" && (
                            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
                              <span className="text-xs text-muted-foreground flex-1">{t("chatbot.wasThisHelpful")}</span>
                              <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => submitHelpful(i, true)} disabled={m.feedbackSaving}>
                                {t("chatbot.yes")}
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => submitHelpful(i, false)} disabled={m.feedbackSaving}>
                                {t("chatbot.no")}
                              </Button>
                            </div>
                          )}
                          {m.feedbackStage === "helpful_done" && <p className="text-xs text-muted-foreground px-1">{t("chatbot.gladToHelp")}</p>}
                          {m.feedbackStage === "awaiting_ticket" && (
                            <div className="rounded-lg border border-border bg-background px-2.5 py-1.5">
                              <div className="flex items-center gap-2">
                                <span role={m.handoffDraftLoadFailed ? "alert" : undefined} className="text-xs text-muted-foreground flex-1">{m.handoffDraftLoadFailed ? t("chatbot.handoff.draftLoadFailed") : t("chatbot.wantTicket")}</span>
                                {m.handoffDraftLoadFailed ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2.5 text-xs"
                                    onClick={() => createTicket(i)}
                                    disabled={Boolean(creatingTicketFor)}
                                  >
                                    {creatingTicketFor ? t("chatbot.creatingTicket") : t("chatbot.handoff.retryDraftLoad")}
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2.5 text-xs"
                                    onClick={() => createTicket(i)}
                                    disabled={Boolean(creatingTicketFor)}
                                  >
                                    {creatingTicketFor ? t("chatbot.creatingTicket") : t("chatbot.yes")}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 text-xs"
                                  onClick={() => declineTicket(i)}
                                  disabled={Boolean(creatingTicketFor)}
                                >
                                  {t("chatbot.no")}
                                </Button>
                              </div>
                              {(m.ticketError || m.ticketErrorCode) && <p role="alert" className="text-[0.6875rem] text-destructive mt-1">{m.ticketErrorCode ? t(`chatbot.supportErrors.${supportError(m.ticketErrorCode).key}`) : m.ticketError}</p>}
                              {m.ticketNeedsSignIn && (
                                <Link href="/login?next=%2Fcustomer%2Fsupport" target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-primary underline">
                                  {t("chatbot.handoff.signIn")}
                                </Link>
                              )}
                            </div>
                          )}
                          {m.feedbackStage === "handoff_preview" && (
                            <div className="space-y-2 rounded-lg border border-border bg-background p-2.5">
                              <label className="block text-xs font-medium">
                                {t("chatbot.handoff.subject")}
                                <input
                                  value={m.handoffSubject ?? ""}
                                  maxLength={255}
                                  disabled={m.ticketOperationUnknown || m.ticketOperationNotFound || creatingTicketFor === (m.messageId ?? m.handoffOperationId)}
                                  onChange={(event) => setMessages((prev) => prev.map((item, index) => index === i ? { ...item, handoffSubject: event.target.value, handoffOperationId: crypto.randomUUID(), handoffDraftSaved: false, handoffConsented: false, ticketError: undefined } : item))}
                                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-normal"
                                />
                              </label>
                              {m.handoffSourceMessage && (
                                <div className="rounded-md bg-muted/50 p-2 text-xs">
                                  <span className="font-medium">{t("chatbot.handoff.selectedQuestion")}</span>
                                  <p className="mt-1 whitespace-pre-wrap">{m.handoffSourceMessage}</p>
                                </div>
                              )}
                              <label className="block text-xs font-medium">
                                {t("chatbot.handoff.summary")}
                                <textarea
                                  value={m.handoffSummary ?? ""}
                                  maxLength={2000}
                                  rows={3}
                                  disabled={m.ticketOperationUnknown || m.ticketOperationNotFound || creatingTicketFor === (m.messageId ?? m.handoffOperationId)}
                                  onChange={(event) => setMessages((prev) => prev.map((item, index) => index === i ? { ...item, handoffSummary: event.target.value, handoffOperationId: crypto.randomUUID(), handoffDraftSaved: false, handoffConsented: false, ticketError: undefined } : item))}
                                  className="mt-1 w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm font-normal"
                                />
                              </label>
                              {(m.ticketError || m.ticketErrorCode) && <p role="alert" className="text-xs text-destructive">{m.ticketErrorCode ? t(`chatbot.supportErrors.${supportError(m.ticketErrorCode).key}`) : m.ticketError}</p>}
                              {m.ticketNeedsSignIn && (
                                <Link href="/login?next=%2Fcustomer%2Fsupport" target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                                  {t("chatbot.handoff.signIn")}
                                </Link>
                              )}
                              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                                <input type="checkbox" checked={m.handoffConsented ?? false} disabled={m.ticketOperationUnknown || m.ticketOperationNotFound || creatingTicketFor === (m.messageId ?? m.handoffOperationId)} onChange={(event) => setMessages((prev) => prev.map((item, index) => index === i ? { ...item, handoffConsented: event.target.checked } : item))} className="mt-0.5 accent-primary" />
                                <span>{t("chatbot.handoff.consent")}</span>
                              </label>
                              <div className="flex items-center justify-end gap-2">
                                {m.handoffDraftSaved && <span className="mr-auto text-xs text-muted-foreground">{t("chatbot.handoff.draftSaved")}</span>}
                                {currentUser && <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => void saveHandoffDraft(i)} disabled={!m.handoffSubject?.trim() || !m.handoffSummary?.trim() || savingHandoffDraftFor === `${currentUser.id}:${m.messageId ?? m.handoffDraftTarget ?? m.handoffOperationId}`}>{savingHandoffDraftFor === `${currentUser.id}:${m.messageId ?? m.handoffDraftTarget ?? m.handoffOperationId}` ? t("chatbot.handoff.savingDraft") : t("chatbot.handoff.saveDraft")}</Button>}
                                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => void cancelHandoffPreview(i)} disabled={creatingTicketFor === (m.messageId ?? m.handoffOperationId) || m.ticketOperationUnknown || m.ticketOperationNotFound}>
                                  {t("chatbot.handoff.cancel")}
                                </Button>
                                <Button size="sm" className="h-7 px-2.5 text-xs" onClick={() => m.ticketOperationUnknown ? void checkTicketOperation(i) : void confirmTicket(i)} disabled={creatingTicketFor === (m.messageId ?? m.handoffOperationId) || !m.handoffSubject?.trim() || !m.handoffSummary?.trim() || (!m.ticketOperationUnknown && !m.handoffConsented)}>
                                  {creatingTicketFor === (m.messageId ?? m.handoffOperationId) ? t("chatbot.creatingTicket") : m.ticketOperationUnknown ? t("chatbot.handoff.check") : m.ticketOperationNotFound ? t("chatbot.handoff.retrySame") : t("chatbot.handoff.confirm")}
                                </Button>
                              </div>
                            </div>
                          )}
                          {m.feedbackStage === "ticket_declined" && <p className="text-xs text-muted-foreground px-1">{t("chatbot.noProblem")}</p>}
                          {m.feedbackStage === "ticket_created" && (
                            <div className="px-1">
                              <p className="text-xs text-muted-foreground">
                                {t("strictMigration.chatbotTicketCreated", { id: m.ticketId?.slice(0, 8).toUpperCase() })}
                              </p>
                              <Link href={m.ticketId ? `/customer/support/${m.ticketId}` : "/customer/support"} className="text-xs text-primary underline">
                                {t("chatbot.viewMyTickets")}
                              </Link>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>

                {/* FAQ shortcuts — category chips, then that category's real KB
                    questions. Tapping a question asks it exactly as written. */}
                {faqOpen && (
                  <div className="max-h-52 overflow-y-auto border-t border-border bg-muted/40 px-3 py-2.5">
                    {faq === undefined && (
                      <p className="text-xs text-muted-foreground">{t("chatbot.faq.loading")}</p>
                    )}
                    {faq === null && (
                      <div role="status" className="flex items-center justify-between gap-2 text-xs text-destructive">
                        <span>{t("chatbot.faq.error")}</span>
                        <button type="button" className="underline" onClick={() => void loadFaq()}>{t("chatbot.faq.retry")}</button>
                      </div>
                    )}
                    {faq && faq.length === 0 && (
                      <p className="text-xs text-muted-foreground">{t("chatbot.faq.empty")}</p>
                    )}
                    {faq && faq.length > 0 && faqCategory === null && (
                      <>
                        <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("chatbot.faq.pickCategory")}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {faq.map((c) => (
                            <button
                              key={c.category}
                              type="button"
                              onClick={() => openFaqCategory(c.category)}
                              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-secondary"
                            >
                              {faqCategoryLabel(c.category, t)}
                              <span className="ml-1 text-muted-foreground">{c.count}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {faq && faqCategory !== null && (
                      <>
                        <button
                          type="button"
                          onClick={returnToFaqCategories}
                          className="mb-2 flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <ChevronLeft size={12} /> {faqCategoryLabel(faqCategory, t)}
                        </button>
                        {faqPageLoading && (faqQuestionPage?.category !== faqCategory || faqQuestionPage.data.page !== faqPage) && (
                          <p role="status" className="text-xs text-muted-foreground">{t("chatbot.faq.loading")}</p>
                        )}
                        {faqPageError && (
                          <div role="alert" className="flex items-center justify-between gap-2 text-xs text-destructive">
                            <span>{t("chatbot.faq.error")}</span>
                            <button type="button" className="underline" onClick={() => void loadFaqQuestions(faqCategory, faqPage)}>{t("chatbot.faq.retry")}</button>
                          </div>
                        )}
                        {faqQuestionPage?.category === faqCategory && faqQuestionPage.data.page === faqPage && faqQuestionPage.data.questions.length === 0 && (
                          <p className="text-xs text-muted-foreground">{t("chatbot.faq.empty")}</p>
                        )}
                        <div className="flex flex-col gap-1">
                          {(faqQuestionPage?.category === faqCategory && faqQuestionPage.data.page === faqPage ? faqQuestionPage.data.questions : []).map((q) => (
                            <button
                              key={q.id}
                              type="button"
                              disabled={sending || guestClaimCandidate?.ownerId === identityKey}
                              onClick={() => {
                                setFaqOpen(false);
                                setFaqCategory(null);
                                void sendMessage(q.question);
                              }}
                              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {q.question}
                            </button>
                          ))}
                        </div>
                        {faqQuestionPage?.category === faqCategory && faqQuestionPage.data.page === faqPage && faqQuestionPage.data.totalPages > 1 && (
                          <Pagination
                            currentPage={faqPage}
                            totalPages={faqQuestionPage.data.totalPages}
                            totalItems={faqQuestionPage.data.total}
                            pageSize={faqQuestionPage.data.pageSize}
                            onPageChange={(page) => void loadFaqQuestions(faqCategory, page)}
                            disabled={faqPageLoading}
                            className="mt-1"
                          />
                        )}
                      </>
                    )}
                  </div>
                )}

                {speech.error && <p role="status" className="px-3 pt-1.5 text-[0.6875rem] text-destructive border-t border-border">{t(`chatbot.voice.errors.${speech.error}`)}</p>}
                <div className={`flex items-center gap-2 px-3 py-3 ${speech.error ? "" : "border-t border-border"}`}>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    placeholder={t("chatbot.inputPlaceholder")}
                    maxLength={500}
                    className="flex-1 min-w-0 h-9 rounded-full border border-border px-3 text-sm bg-background text-foreground"
                    disabled={sending || guestClaimCandidate?.ownerId === identityKey}
                  />
                  <button
                    type="button"
                    onClick={toggleFaq}
                    disabled={guestClaimCandidate?.ownerId === identityKey}
                    aria-label={t("chatbot.faq.toggle")}
                    aria-expanded={faqOpen}
                    title={t("chatbot.faq.toggle")}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      faqOpen
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <HelpCircle size={15} />
                  </button>
                  {speech.isSupported && (
                    <button
                      type="button"
                      onClick={() => (speech.isListening ? speech.stop() : speech.start())}
                      disabled={sending || guestClaimCandidate?.ownerId === identityKey}
                      aria-label={speech.isListening ? t("chatbot.voice.stop") : t("chatbot.voice.start")}
                      title={speech.isListening ? t("chatbot.voice.stop") : t("chatbot.voice.start")}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        speech.isListening
                          ? "border-destructive bg-destructive/10 text-destructive animate-pulse"
                          : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      {speech.isListening ? <MicOff size={15} /> : <Mic size={15} />}
                    </button>
                  )}
                  <Button size="icon" className="h-9 w-9 rounded-full shrink-0" onClick={() => sendMessage()} aria-label={t("chatbot.send")} disabled={sending || guestClaimCandidate?.ownerId === identityKey || !input.trim()}>
                    <Send size={14} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="hidden min-h-0 flex-1 flex-col items-center justify-center px-6 text-center sm:flex">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-secondary text-primary">
                  <MessageCircle size={28} />
                </div>
                <h2 className="text-lg font-bold text-foreground">{tCustomer("strictMigration.chat.selectConversation")}</h2>
                <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{tCustomer("strictMigration.chat.selectConversationHint")}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <Button size="icon" className={`relative h-14 w-14 rounded-full shadow-lg ${hideLauncherOnMobile ? "max-md:hidden" : ""}`} onClick={() => setOpen(true)} title={t("chatbot.openChat")} aria-label={t("accessibility.openChat")}>
          <MessageCircle size={22} />
          {unreadChatCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[0.5625rem] font-bold leading-4 text-white">
              {unreadChatCount > 99 ? "99+" : unreadChatCount}
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
