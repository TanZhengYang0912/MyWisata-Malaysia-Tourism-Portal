"use client";

// P4 — Member 4: customer ticket detail + reply thread. CLAUDE-FIXES.md Fix 2,
// bubble rendering delegated to the shared <TicketThread> per CLAUDE-FIXES-2.md item 2.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bell, BellOff, FileText, Mic, MicOff, Paperclip, Send, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { TicketThread, type ReplyMessage } from "@/components/shared/ticket-thread";
import { ReportChatButton } from "@/components/shared/report-chat-button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { useTranslation } from "react-i18next";
import { useSpeechInput, resolveRecognitionLangFromLocale, type SpeechInputErrorKind } from "@/hooks/use-speech-input";
import { supportError, supportTicketLoadFailure } from "@/lib/support/errors";
import { validateChatAttachmentMetadata } from "@/lib/chat/attachment";
import { clearSessionOperationId, readSessionOperationId, saveSessionOperationId, supportAttachmentOperationStorageKey } from "@/lib/support/operation-storage";

// CLAUDE-VOICE-INPUT.md, mounted on support tickets. Same friendly copy as
// the chatbot widget's and chat-thread-panel's mic buttons — keys, not
// literals, since systemwide localization forbids untranslated UI strings.
const SPEECH_ERROR_KEY: Record<SpeechInputErrorKind, string> = {
  "permission-denied": "ui.support.voice.errors.permissionDenied",
  "no-speech": "ui.support.voice.errors.noSpeech",
  network: "ui.support.voice.errors.network",
  unknown: "ui.support.voice.errors.unknown",
};

interface TicketDetail {
  id: string;
  viewerIsOwner: boolean;
  subject: string;
  body: string;
  handoffSourceMessage: string | null;
  category: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  resolvedAt: string | null;
  muted: boolean;
  replies: ReplyMessage[];
  repliesCursor: { createdAt: string; id: string } | null;
}

const LOCKED_STATUSES = new Set(["resolved", "closed"]);
const TICKET_STATUS_VALUES = new Set(["open", "in_progress", "resolved", "closed"]);
const REOPEN_OPERATION_STORAGE_PREFIX = "mw_support_reopen_operation:";
const REPLY_OPERATION_STORAGE_PREFIX = "mw_support_reply_operation:";
const OPERATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface ReplyOperation {
  storageKey: string;
  operationId: string;
  submitted: boolean;
  completed?: boolean;
}

function readReopenOperation(storageKey: string): string | null {
  try {
    const operationId = window.localStorage.getItem(storageKey);
    return operationId && OPERATION_ID_PATTERN.test(operationId) ? operationId : null;
  } catch {
    return null;
  }
}

function saveReopenOperation(storageKey: string, operationId: string): boolean {
  try {
    window.localStorage.setItem(storageKey, operationId);
    return true;
  } catch {
    return false;
  }
}

function clearReopenOperation(storageKey: string) {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // A confirmed database result must not be hidden by cleanup failure.
  }
}

function replyOperationStorageKey(ownerId: string, ticketId: string): string {
  return `${REPLY_OPERATION_STORAGE_PREFIX}${ownerId}:${ticketId}`;
}

function readReplyOperation(storageKey: string): string | null {
  try {
    const operationId = window.sessionStorage.getItem(storageKey);
    return operationId && OPERATION_ID_PATTERN.test(operationId) ? operationId : null;
  } catch {
    return null;
  }
}

function saveReplyOperation(storageKey: string, operationId: string): boolean {
  try {
    window.sessionStorage.setItem(storageKey, operationId);
    return true;
  } catch {
    return false;
  }
}

function clearReplyOperation(storageKey: string, operationId: string) {
  try {
    if (window.sessionStorage.getItem(storageKey) === operationId) {
      window.sessionStorage.removeItem(storageKey);
    }
  } catch {
    // The server result remains authoritative if browser cleanup is unavailable.
  }
}

export default function CustomerTicketDetailPage() {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const { t: tCommon } = useTranslation("common");
  const { id } = useParams<{ id: string }>();
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const [ticket, setTicket] = useState<TicketDetail | null | undefined>(undefined);
  const [ticketLoadedForId, setTicketLoadedForId] = useState<string | null>(null);
  const [ticketLoadError, setTicketLoadError] = useState<string | null>(null);
  const [readStatusErrorCode, setReadStatusErrorCode] = useState<string | null>(null);
  const currentTicketId = useRef(id);
  const currentOwnerId = useRef(currentUser?.id ?? null);
  const ticketLoadGeneration = useRef(0);
  const ticketLoadController = useRef<AbortController | null>(null);
  const loadedTicketId = useRef<string | null>(null);
  const completedReadMarkers = useRef(new Set<string>());
  const pendingReadMarkers = useRef(new Set<string>());
  const [loadingEarlierReplies, setLoadingEarlierReplies] = useState(false);
  const [earlierRepliesError, setEarlierRepliesError] = useState(false);
  const earlierRepliesRequest = useRef(false);
  const earlierRepliesController = useRef<AbortController | null>(null);
  const [reply, setReply] = useState("");
  const [replyDraftVersion, setReplyDraftVersion] = useState(0);
  const [replyDraftSaved, setReplyDraftSaved] = useState(false);
  const [savingReplyDraft, setSavingReplyDraft] = useState(false);
  const [replyDraftLoadFailed, setReplyDraftLoadFailed] = useState(false);
  const replyDraftInputTouched = useRef(false);
  const [replyOperation, setReplyOperation] = useState<ReplyOperation | null>(null);
  const [attachmentOperationId, setAttachmentOperationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [muting, setMuting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const attachmentOperationStorageKeyRef = useRef<string | null>(null);
  const uploadInFlightRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  function updateReply(value: string) {
    replyDraftInputTouched.current = true;
    setReply(value);
    setReplyDraftSaved(false);
    setReplyDraftLoadFailed(false);
    const storageKey = currentUser?.id ? replyOperationStorageKey(currentUser.id, id) : null;
    let previous = replyOperation;
    if (previous?.storageKey === storageKey && previous.completed) {
      clearReplyOperation(previous.storageKey, previous.operationId);
      previous = null;
    }
    setReplyOperation(previous?.storageKey === storageKey && previous.submitted
      ? previous
      : value.trim() && storageKey
        ? { storageKey, operationId: crypto.randomUUID(), submitted: false }
        : null);
    if (pendingFile && currentUser?.id) {
      const attachmentStorageKey = supportAttachmentOperationStorageKey("customer", currentUser.id, id);
      attachmentOperationStorageKeyRef.current = attachmentStorageKey;
      setAttachmentOperationId(readSessionOperationId(attachmentStorageKey) ?? crypto.randomUUID());
    }
  }

  const speech = useSpeechInput({ lang: resolveRecognitionLangFromLocale(i18n.resolvedLanguage), onTranscriptChange: updateReply });

  useLayoutEffect(() => {
    currentTicketId.current = id;
  }, [id]);

  useLayoutEffect(() => {
    currentOwnerId.current = currentUser?.id ?? null;
  }, [currentUser?.id]);

  async function loadTicket(): Promise<TicketDetail | null> {
    const requestedTicketId = id;
    ticketLoadController.current?.abort();
    const controller = new AbortController();
    ticketLoadController.current = controller;
    const requestGeneration = ++ticketLoadGeneration.current;
    const isCurrentRequest = () => !controller.signal.aborted
      && requestGeneration === ticketLoadGeneration.current
      && requestedTicketId === currentTicketId.current;
    earlierRepliesController.current?.abort();
    earlierRepliesController.current = null;
    earlierRepliesRequest.current = false;
    setLoadingEarlierReplies(false);
    try {
      const res = await fetch(`/api/support/tickets/${requestedTicketId}`, { cache: "no-store", signal: controller.signal });
      const body = (await res.json().catch(() => ({}))) as { data?: TicketDetail | null; error?: { code?: string } };
      if (!isCurrentRequest()) return null;
      if (!res.ok || !body.data) {
        const statusCode = res.status === 401 ? "UNAUTHORIZED"
          : res.status === 403 ? "FORBIDDEN"
            : res.status === 404 ? "NOT_FOUND"
              : undefined;
        const errorCode = body.error?.code ?? statusCode ?? (res.ok ? "NOT_FOUND" : "READ_UNAVAILABLE");
        const ticketIsUnavailable = errorCode === "UNAUTHORIZED" || errorCode === "FORBIDDEN" || errorCode === "NOT_FOUND";
        setTicketLoadError(errorCode);
        setReadStatusErrorCode(null);
        if (ticketIsUnavailable || loadedTicketId.current !== requestedTicketId) {
          loadedTicketId.current = requestedTicketId;
          setTicketLoadedForId(requestedTicketId);
          setTicket(null);
        } else {
          setTicket((current) => current === undefined ? null : current);
        }
        return null;
      }
      loadedTicketId.current = requestedTicketId;
      setTicketLoadedForId(requestedTicketId);
      setTicketLoadError(null);
      setReadStatusErrorCode(null);
      setEarlierRepliesError(false);
      setTicket(body.data);
      return body.data;
    } catch {
      if (!isCurrentRequest()) return null;
      setTicketLoadError("READ_UNAVAILABLE");
      setReadStatusErrorCode(null);
      if (loadedTicketId.current !== requestedTicketId) {
        loadedTicketId.current = requestedTicketId;
        setTicketLoadedForId(requestedTicketId);
        setTicket(null);
      } else {
        setTicket((current) => current === undefined ? null : current);
      }
      return null;
    } finally {
      if (ticketLoadController.current === controller) ticketLoadController.current = null;
    }
  }

  const markDisplayedRepliesAsRead = useCallback(async (displayedTicket: TicketDetail) => {
    if (displayedTicket.id !== currentTicketId.current || !displayedTicket.viewerIsOwner || document.visibilityState !== "visible") return;
    const lastIncomingReply = [...displayedTicket.replies].reverse().find((reply) => reply.sender_role === "admin");
    if (!lastIncomingReply) return;
    const markerKey = `${displayedTicket.id}:${lastIncomingReply.id}`;
    if (completedReadMarkers.current.has(markerKey) || pendingReadMarkers.current.has(markerKey)) return;

    pendingReadMarkers.current.add(markerKey);
    try {
      const response = await fetch(`/api/support/tickets/${displayedTicket.id}/read`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface: "customer", lastDisplayedReplyId: lastIncomingReply.id }),
      });
      const result = await response.json().catch(() => ({})) as { data?: unknown; error?: { code?: string } };
      if (!response.ok || !result.data) {
        const errorCode = response.status === 401 ? "UNAUTHORIZED"
          : response.status === 403 ? "FORBIDDEN"
            : response.status === 404 ? "NOT_FOUND"
              : "READ_UNAVAILABLE";
        if (currentTicketId.current !== displayedTicket.id) return;
        if (errorCode === "UNAUTHORIZED" || errorCode === "FORBIDDEN" || errorCode === "NOT_FOUND") {
          loadedTicketId.current = displayedTicket.id;
          setTicketLoadedForId(displayedTicket.id);
          setTicketLoadError(errorCode);
          setReadStatusErrorCode(null);
          setTicket(null);
        } else {
          setReadStatusErrorCode(errorCode);
        }
        return;
      }
      completedReadMarkers.current.add(markerKey);
      if (currentTicketId.current === displayedTicket.id) setReadStatusErrorCode(null);
    } catch {
      if (currentTicketId.current === displayedTicket.id) setReadStatusErrorCode("READ_UNAVAILABLE");
    } finally {
      pendingReadMarkers.current.delete(markerKey);
    }
  }, []);

  async function loadEarlierReplies() {
    if (!ticket?.repliesCursor || loadingEarlierReplies || earlierRepliesRequest.current) return;
    const targetTicketId = ticket.id;
    const cursor = ticket.repliesCursor;
    earlierRepliesRequest.current = true;
    const controller = new AbortController();
    earlierRepliesController.current = controller;
    setLoadingEarlierReplies(true);
    setEarlierRepliesError(false);
    try {
      const params = new URLSearchParams({ beforeCreatedAt: cursor.createdAt, beforeId: cursor.id });
      const response = await fetch(`/api/support/tickets/${targetTicketId}/replies?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json().catch(() => ({})) as { data?: { replies?: ReplyMessage[]; nextCursor?: TicketDetail["repliesCursor"] } };
      if (!response.ok || !result.data || !Array.isArray(result.data.replies)) throw new Error("support_replies_unavailable");
      const olderReplies = result.data.replies;
      const nextCursor = result.data.nextCursor ?? null;
      setTicket((current) => current?.id === targetTicketId
        && current.repliesCursor?.createdAt === cursor.createdAt
        && current.repliesCursor?.id === cursor.id ? {
        ...current,
        replies: [...olderReplies, ...current.replies],
        repliesCursor: nextCursor,
      } : current);
    } catch {
      if (!controller.signal.aborted) setEarlierRepliesError(true);
    } finally {
      if (earlierRepliesController.current === controller) {
        earlierRepliesController.current = null;
        earlierRepliesRequest.current = false;
        setLoadingEarlierReplies(false);
      }
    }
  }

  useEffect(() => {
    let isActive = true;
    void Promise.resolve().then(() => {
      if (isActive) void loadTicket();
    });
    return () => {
      isActive = false;
      ticketLoadGeneration.current += 1;
      ticketLoadController.current?.abort();
      ticketLoadController.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!ticket) return;
    const markWhenVisible = () => {
      if (document.visibilityState === "visible") void markDisplayedRepliesAsRead(ticket);
    };
    markWhenVisible();
    document.addEventListener("visibilitychange", markWhenVisible);
    return () => document.removeEventListener("visibilitychange", markWhenVisible);
  }, [markDisplayedRepliesAsRead, ticket]);

  const loadReplyDraft = async (signal?: AbortSignal) => {
    if (!currentUser || !ticket?.viewerIsOwner) return;
    setReplyDraftLoadFailed(false);
    try {
      const response = await fetch(`/api/support/drafts?surface=ticket_reply&target=${encodeURIComponent(id)}`, { cache: "no-store", signal });
      const result = await response.json().catch(() => ({})) as { data?: { body?: string; version?: number } };
      if (!response.ok || !result.data) throw new Error("support_draft_load_failed");
      if (signal?.aborted) return;
      if (replyDraftInputTouched.current) return;
      setReply(result.data.body ?? "");
      setReplyDraftVersion(result.data.version ?? 0);
      setReplyDraftSaved(Boolean(result.data.version));
    } catch {
      if (!signal?.aborted) setReplyDraftLoadFailed(true);
    }
  };

  useEffect(() => {
    if (!currentUser || !ticket?.viewerIsOwner) return;
    const controller = new AbortController();
    // This effect starts an external read; state updates happen only after its response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReplyDraft(controller.signal);
    return () => controller.abort();
  // The draft target is the ticket and current account; the load is retried only by the explicit button.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, id, ticket?.viewerIsOwner]);

  async function saveReplyDraft() {
    if (!ticket?.viewerIsOwner || savingReplyDraft || !reply.trim()) return;
    setSavingReplyDraft(true);
    try {
      const response = await fetch("/api/support/drafts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ surface: "ticket_reply", target: id, subject: "", body: reply, expectedVersion: replyDraftVersion }),
      });
      const result = await response.json().catch(() => ({})) as { data?: { version?: number } };
      if (!response.ok || typeof result.data?.version !== "number") {
        showFeedback("error", tCommon("chatbot.handoff.draftSaveFailed"));
        return;
      }
      setReplyDraftVersion(result.data.version);
      setReplyDraftSaved(true);
      showFeedback("success", tCommon("chatbot.handoff.draftSaved"));
    } catch {
      showFeedback("error", tCommon("chatbot.handoff.draftSaveFailed"));
    } finally {
      setSavingReplyDraft(false);
    }
  }

  async function sendReply() {
    if (pendingFile) return sendAttachment();
    const text = reply.trim();
    if (!text || sending) return;
    if (!currentUser?.id) {
      showFeedback("error", tCommon("chatbot.supportErrors.signIn"));
      return;
    }
    const unresolvedAttachment = supportAttachmentOperationStorageKey("customer", currentUser.id, id);
    if (readSessionOperationId(unresolvedAttachment)) {
      showFeedback("error", tCommon("chatbot.supportErrors.attachmentChecking"));
      return;
    }
    const storageKey = replyOperationStorageKey(currentUser.id, id);
    const currentOperation = replyOperation?.storageKey === storageKey ? replyOperation : null;
    const operationId = currentOperation?.submitted && !currentOperation.completed
      ? currentOperation.operationId
      : readReplyOperation(storageKey) ?? currentOperation?.operationId ?? crypto.randomUUID();
    if (!saveReplyOperation(storageKey, operationId)) {
      showFeedback("error", tCommon("chatbot.supportErrors.replyRecoveryUnavailable"));
      return;
    }
    setReplyOperation({ storageKey, operationId, submitted: true });
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, operationId }),
      });
      const result = await res.json().catch(() => null) as { data?: { id?: unknown }; error?: { code?: string } } | null;
      if (!res.ok) {
        if (result?.error?.code === "OPERATION_CONFLICT") {
          clearReplyOperation(storageKey, operationId);
          setReplyOperation({ storageKey, operationId: crypto.randomUUID(), submitted: false });
          await loadTicket();
          showFeedback("error", tCustomer("ui.support.replyOperationConflict"));
          return;
        }
        showFeedback("error", result?.error?.code ? tCommon(`chatbot.supportErrors.${supportError(result.error.code).key}`) : tCustomer("ui.support.replyError"));
        return;
      }
      if (typeof result?.data?.id !== "string") {
        showFeedback("error", tCommon("chatbot.supportErrors.checking"));
        return;
      }
      setReply("");
      setReplyDraftSaved(false);
      let draftCleared = false;
      try {
        const deleteResponse = await fetch(`/api/support/drafts?surface=ticket_reply&target=${encodeURIComponent(id)}`, { method: "DELETE" });
        draftCleared = deleteResponse.ok;
      } catch {
        draftCleared = false;
      }
      if (draftCleared) {
        clearReplyOperation(storageKey, operationId);
        setReplyOperation(null);
        showFeedback("success", tCustomer("ui.support.replySent"));
      } else {
        setReplyOperation({ storageKey, operationId, submitted: true, completed: true });
        showFeedback("success", tCustomer("ui.support.replyDraftCleanupFailed"));
      }
      await loadTicket();
    } catch {
      showFeedback("error", tCommon("chatbot.supportErrors.checking"));
    } finally {
      setSending(false);
    }
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;
    const validation = validateChatAttachmentMetadata(file);
    if (!validation.ok) {
      showFeedback("error", tCommon(`chatbot.supportErrors.${supportError(validation.code).key}`));
      return;
    }
    setPendingFile(file);
    const storageKey = currentUser?.id ? supportAttachmentOperationStorageKey("customer", currentUser.id, id) : null;
    attachmentOperationStorageKeyRef.current = storageKey;
    setAttachmentOperationId(storageKey ? readSessionOperationId(storageKey) : null);
  }

  async function sendAttachment() {
    if (!pendingFile || uploading || uploadInFlightRef.current) return;
    if (!currentUser?.id) {
      showFeedback("error", tCommon("chatbot.supportErrors.signIn"));
      return;
    }
    const storageKey = supportAttachmentOperationStorageKey("customer", currentUser.id, id);
    if (attachmentOperationStorageKeyRef.current && attachmentOperationStorageKeyRef.current !== storageKey) {
      showFeedback("error", tCommon("chatbot.supportErrors.attachmentRecoveryAnotherTicket"));
      return;
    }
    const currentOperationId = attachmentOperationStorageKeyRef.current === storageKey ? attachmentOperationId : null;
    const operationId = currentOperationId ?? readSessionOperationId(storageKey) ?? crypto.randomUUID();
    if (!saveSessionOperationId(storageKey, operationId)) {
      showFeedback("error", tCommon("chatbot.supportErrors.attachmentRecoveryUnavailable"));
      return;
    }
    uploadInFlightRef.current = true;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      setAttachmentOperationId(operationId);
      attachmentOperationStorageKeyRef.current = storageKey;
      formData.append("operationId", operationId);
      if (reply.trim()) formData.append("caption", reply.trim());
      const res = await fetch(`/api/support/tickets/${id}/attachments`, { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { code?: string } };
        if (body.error?.code === "OPERATION_CONFLICT") {
          const nextOperationId = crypto.randomUUID();
          const savedNextOperation = saveSessionOperationId(storageKey, nextOperationId);
          setAttachmentOperationId(nextOperationId);
          await loadTicket();
          showFeedback("error", tCommon(savedNextOperation
            ? "chatbot.supportErrors.attachmentConflict"
            : "chatbot.supportErrors.attachmentRecoveryUnavailable"));
          return;
        }
        if (body.error?.code === "WRITE_UNAVAILABLE" || res.status >= 500) {
          await loadTicket();
          showFeedback("error", tCommon("chatbot.supportErrors.attachmentChecking"));
          return;
        }
        if (body.error?.code === "UPLOAD_FAILED" || body.error?.code === "ATTACHMENT_RESELECT_REQUIRED") {
          clearSessionOperationId(storageKey, operationId);
          setAttachmentOperationId(null);
        }
        showFeedback("error", body.error?.code ? tCommon(`chatbot.supportErrors.${supportError(body.error.code).key}`) : tCustomer("ui.support.attachmentError"));
        return;
      }
      const result = await res.json().catch(() => null) as { data?: { id?: unknown } } | null;
      if (typeof result?.data?.id !== "string") {
        await loadTicket();
        showFeedback("error", tCommon("chatbot.supportErrors.attachmentChecking"));
        return;
      }
      let draftCleared = false;
      try {
        const deleteResponse = await fetch(`/api/support/drafts?surface=ticket_reply&target=${encodeURIComponent(id)}`, { method: "DELETE" });
        draftCleared = deleteResponse.ok;
      } catch {
        draftCleared = false;
      }
      if (draftCleared) {
        clearSessionOperationId(storageKey, operationId);
        setReply("");
        setReplyDraftSaved(false);
        setPendingFile(null);
        setAttachmentOperationId(null);
        attachmentOperationStorageKeyRef.current = null;
        showFeedback("success", tCustomer("ui.support.replySent"));
      } else {
        showFeedback("success", tCustomer("ui.support.attachmentDraftCleanupFailed"));
      }
      await loadTicket();
    } catch {
      await loadTicket();
      showFeedback("error", tCommon("chatbot.supportErrors.attachmentChecking"));
    } finally {
      uploadInFlightRef.current = false;
      setUploading(false);
    }
  }

  async function toggleMute() {
    if (!ticket || muting) return;
    const nextMuted = !ticket.muted;
    setMuting(true);
    setTicket((t) => (t ? { ...t, muted: nextMuted } : t));
    try {
      const res = await fetch(`/api/support/tickets/${id}/mute`, { method: nextMuted ? "POST" : "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setTicket((t) => (t ? { ...t, muted: !nextMuted } : t));
      showFeedback("error", tCustomer("ui.support.muteError"));
    } finally {
      setMuting(false);
    }
  }

  async function reopenTicket() {
    if (reopening || !currentUser?.id) return;
    const ownerId = currentUser.id;
    const storageKey = `${REOPEN_OPERATION_STORAGE_PREFIX}${ownerId}:${id}`;
    const storedOperationId = readReopenOperation(storageKey);
    const operationId = storedOperationId ?? crypto.randomUUID();
    if (!saveReopenOperation(storageKey, operationId)) {
      showFeedback("error", tCommon("chatbot.supportErrors.reopenRecoveryUnavailable"));
      return;
    }
    setReopening(true);
    try {
      const res = await fetch(`/api/support/tickets/${id}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operationId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { code?: string } };
        if (currentOwnerId.current !== ownerId || currentTicketId.current !== id) return;
        const errorCode = body.error?.code;
        if (res.status < 500 && errorCode !== "OPERATION_UNKNOWN" && errorCode !== "WRITE_UNAVAILABLE") {
          clearReopenOperation(storageKey);
        }
        const message = body.error?.code
          ? tCommon(`chatbot.supportErrors.${supportError(body.error.code).key}`)
          : tCustomer("ui.support.reopenError");
        showFeedback("error", message);
        return;
      }
      if (currentOwnerId.current !== ownerId || currentTicketId.current !== id) return;
      const body = await res.json().catch(() => null) as {
        data?: { id?: unknown; status?: unknown; changed?: unknown; replayed?: unknown };
      } | null;
      if (!body?.data || body.data.id !== id
          || typeof body.data.status !== "string" || !TICKET_STATUS_VALUES.has(body.data.status)
          || typeof body.data.changed !== "boolean" || typeof body.data.replayed !== "boolean") {
        showFeedback("error", tCommon("chatbot.supportErrors.checking"));
        return;
      }
      clearReopenOperation(storageKey);
      showFeedback("success", body.data.replayed === true
        ? tCustomer("ui.support.ticketReopenReplayed")
        : tCustomer("ui.support.ticketReopened"));
      await loadTicket();
    } catch {
      if (currentOwnerId.current === ownerId && currentTicketId.current === id) {
        showFeedback("error", tCommon("chatbot.supportErrors.checking"));
      }
    } finally {
      setReopening(false);
    }
  }

  if (ticketLoadedForId !== id || ticket === undefined || !currentUser) {
    return <div role="status" aria-live="polite" className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-sm text-muted-foreground">{tCustomer("ui.states.loading")}</div>;
  }
  if (ticket === null) {
    const errorCode = ticketLoadError ?? "READ_UNAVAILABLE";
    const requiresSignIn = errorCode === "UNAUTHORIZED";
    const canRetry = !requiresSignIn && supportTicketLoadFailure(errorCode) === "retry";
    return (
      <EmptyState
        title={tCustomer("ui.support.ticketLoadError")}
        description={requiresSignIn || canRetry ? tCommon(`chatbot.supportErrors.${supportError(errorCode).key}`) : tCustomer("ui.support.ticketNotFound")}
        action={requiresSignIn ? (
          <Link href={`/login?next=${encodeURIComponent(`/customer/support/${id}`)}`} className="text-primary underline">
            {tCustomer("ui.guest.signIn")}
          </Link>
        ) : canRetry ? (
          <Button type="button" variant="outline" onClick={() => void loadTicket()}>{tCustomer("ui.support.retry")}</Button>
        ) : (
          <Link href="/customer/support" className="text-primary underline">{tCustomer("ui.support.myTickets")}</Link>
        )}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <Link href="/customer/support" className="text-xs text-muted-foreground flex items-center gap-1 mb-4 hover:opacity-70">
        <ArrowLeft size={13} aria-hidden="true" /> {tCustomer("ui.support.myTickets")}
      </Link>

      {ticketLoadError && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{tCommon(`chatbot.supportErrors.${supportError(ticketLoadError).key}`)}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadTicket()}>{tCustomer("ui.support.retry")}</Button>
        </div>
      )}

      {readStatusErrorCode && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{tCommon(`chatbot.supportErrors.${supportError(readStatusErrorCode).key}`)}</span>
          {readStatusErrorCode === "UNAUTHORIZED" ? (
            <Link href={`/login?next=${encodeURIComponent(`/customer/support/${ticket.id}`)}`} className="text-primary underline">
              {tCustomer("ui.guest.signIn")}
            </Link>
          ) : readStatusErrorCode === "FORBIDDEN" || readStatusErrorCode === "NOT_FOUND" ? (
            <Link href="/customer/support" className="text-primary underline">
              {tCustomer("ui.support.myTickets")}
            </Link>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => void loadTicket()}>
              {tCustomer("ui.support.retry")}
            </Button>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-foreground font-[family-name:var(--font-display)]">{ticket.subject}</h1>
          {ticket.muted && (
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[0.625rem] font-semibold text-muted-foreground" title={tCustomer("ui.support.mutedHint")}>
              <BellOff size={10} /> {tCustomer("ui.support.muted")}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs font-semibold rounded-full px-3 py-1.5 bg-muted text-muted-foreground">
            {tCustomer(`ui.support.status.${ticket.status}`)}
          </span>
          <button
            type="button"
            onClick={toggleMute}
            disabled={muting}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={ticket.muted ? tCustomer("ui.support.unmute") : tCustomer("ui.support.mute")}
            title={ticket.muted ? tCustomer("ui.support.unmute") : tCustomer("ui.support.muteHint")}
          >
            {ticket.muted ? <BellOff size={14} /> : <Bell size={14} />}
          </button>
          <ReportChatButton chatType="user_admin" threadId={ticket.id} returnPath={`/customer/support/${ticket.id}`} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-6">
        {ticket.category} · {tCustomer("ui.support.opened")} {new Date(ticket.createdAt).toLocaleDateString(i18n.resolvedLanguage || undefined)}
      </p>

      <div className="rounded-xl border border-border overflow-hidden mb-4">
        <div className="max-h-[50vh] overflow-y-auto px-4 py-4">
          <TicketThread
            ticketId={ticket.id}
            ticketIsMine={ticket.viewerIsOwner}
            ticketBody={ticket.body}
            handoffSourceMessage={ticket.handoffSourceMessage}
            ticketCreatedAt={ticket.createdAt}
            replies={ticket.replies}
            hasEarlierReplies={Boolean(ticket.repliesCursor)}
            loadingEarlierReplies={loadingEarlierReplies}
            earlierRepliesError={earlierRepliesError}
            onLoadEarlierReplies={() => void loadEarlierReplies()}
          />
        </div>
      </div>

      {LOCKED_STATUSES.has(ticket.status) ? (
        <div className="rounded-xl border border-border bg-muted px-4 py-3 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            {tCustomer("ui.support.resolved")}{" "}
            <button onClick={reopenTicket} disabled={reopening} className="text-primary underline font-medium">
              {reopening ? tCustomer("ui.support.reopening") : tCustomer("ui.support.reopen")}
            </button>{" "}
            {tCustomer("ui.support.startNew")}
          </p>
        </div>
      ) : (
        <div>
          {speech.error && <p className="mb-1.5 text-xs text-destructive">{tCustomer(SPEECH_ERROR_KEY[speech.error])}</p>}
          {replyDraftLoadFailed && <p role="alert" className="mb-2 text-sm text-red-600 dark:text-red-300">{tCommon("chatbot.handoff.draftLoadFailed")} <button type="button" className="underline" onClick={() => void loadReplyDraft()}>{tCommon("chatbot.handoff.retryDraftLoad")}</button></p>}
          {pendingFile && (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-border bg-secondary/60 px-3 py-2 text-xs">
              <FileText size={18} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1 break-words whitespace-normal text-foreground">{pendingFile.name}</span>
              <button type="button" onClick={() => { setPendingFile(null); setAttachmentOperationId(null); }} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={tCustomer("ui.support.removeAttachment")}>
                <X size={14} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFileSelected} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={tCustomer("ui.support.attachFile")}
            >
              <Paperclip size={15} />
            </button>
            <input
              value={reply}
              onChange={(e) => {
                updateReply(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  sendReply();
                }
              }}
              aria-label={tCustomer("ui.support.reply")}
              placeholder={pendingFile ? tCustomer("ui.support.addCaption") : tCustomer("ui.support.reply")}
              maxLength={2000}
              className="flex-1 min-w-0 h-10 rounded-full border border-border px-4 text-sm bg-background text-foreground"
              disabled={sending || uploading}
            />
            {speech.isSupported && (
              <button
                type="button"
                onClick={() => (speech.isListening ? speech.stop() : speech.start())}
                disabled={sending || uploading}
                aria-label={speech.isListening ? tCustomer("ui.support.voice.stop") : tCustomer("ui.support.voice.start")}
                title={speech.isListening ? tCustomer("ui.support.voice.stop") : tCustomer("ui.support.voice.start")}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  speech.isListening
                    ? "border-destructive bg-destructive/10 text-destructive animate-pulse"
                    : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {speech.isListening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
            )}
            <Button size="icon" className="h-10 w-10 rounded-full shrink-0" onClick={sendReply} disabled={sending || uploading || (!reply.trim() && !pendingFile)}>
              <Send size={14} aria-hidden="true" />
            </Button>
          </div>
          <div className="mt-2 flex min-h-7 items-center justify-end gap-2">
            {replyDraftSaved && <span className="mr-auto text-xs text-muted-foreground">{tCommon("chatbot.handoff.draftSaved")}</span>}
            <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => void saveReplyDraft()} disabled={savingReplyDraft || !reply.trim()}>{tCommon("chatbot.handoff.saveDraft")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
