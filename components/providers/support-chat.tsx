"use client";

// P4 — CLAUDE-SUPPORT-MUTE-REPORT.md Feature 1: lets any entry point under
// the customer layout (the floating bubble, the profile page's "Contact
// Support" button, outlet/activity "Message vendor" buttons, ...) open the
// SAME chat widget instance instead of each spawning its own chat surface.
// Mirrors the app's existing shared-state convention (TripProvider,
// WishlistProvider, ...).
//
// Widget merge (2026-09): the floating widget now covers both the AI
// support conversation and every vendor chat thread in one split view, so
// this provider carries "which conversation is selected" alongside
// open/closed — a plain selection value, not a navigation stack, since both
// panes render at once (see chatbot-widget.tsx).

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useAuth } from "@/components/providers/auth";
import { supabase } from "@/backend/supabase";

export type SelectedChat = { kind: "support" } | { kind: "vendor"; threadId: string };

interface SupportChatContextValue {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  /** null = nothing picked yet (the split view's empty right pane). */
  selected: SelectedChat | null;
  /** Selects a conversation and opens the widget in one call; pass null to clear back to the empty state (used by the mobile-only back button). */
  selectChat: (chat: SelectedChat | null) => void;
  /** Total unread vendor-chat messages across all threads — badges the toggle bubble. Not ticket-reply unread (that stays separate, tracked in app/customer/layout.tsx). */
  unreadChatCount: number;
}

const SupportChatContext = createContext<SupportChatContextValue | null>(null);

export function SupportChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedChat | null>(null);
  const { currentUser } = useAuth();
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  const selectChat = useCallback((chat: SelectedChat | null) => {
    setSelected(chat);
    if (chat) setOpen(true);
  }, []);

  // Moved here from app/customer/layout.tsx's `unreadChats` state — same
  // fetch-once-then-realtime-refetch shape, just exposed through context now
  // so the widget's own toggle bubble can badge it instead of the account
  // avatar (vendor chat no longer has any affordance in the account menu).
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/chat/unread-count");
        const body = (await res.json()) as { data: { count: number } | null };
        if (!cancelled && res.ok && body.data) setUnreadChatCount(body.data.count);
      } catch {
        // best-effort — a failed refresh just leaves the last-known count showing
      }
    }
    void load();
    const channel = supabase
      .channel(`nav-chat-unread-${currentUser.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_message_reads" }, () => void load())
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [currentUser]);

  const value = useMemo(
    () => ({ open, setOpen, selected, selectChat, unreadChatCount }),
    [open, selected, selectChat, unreadChatCount],
  );

  return <SupportChatContext.Provider value={value}>{children}</SupportChatContext.Provider>;
}

export function useSupportChat() {
  const ctx = useContext(SupportChatContext);
  if (!ctx) throw new Error("useSupportChat must be used within SupportChatProvider");
  return ctx;
}
