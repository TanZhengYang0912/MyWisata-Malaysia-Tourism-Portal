"use client";

// P4 — CLAUDE-SUPPORT-MUTE-REPORT.md Feature 1: lets any entry point under
// the customer layout (the floating bubble, the profile page's "Contact
// Support" button, future callers) open the SAME chatbot-widget instance
// instead of each spawning its own chat surface. Mirrors the app's existing
// shared-state convention (TripProvider, WishlistProvider, ...).

import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

interface SupportChatContextValue {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}

const SupportChatContext = createContext<SupportChatContextValue | null>(null);

export function SupportChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <SupportChatContext.Provider value={{ open, setOpen }}>{children}</SupportChatContext.Provider>;
}

export function useSupportChat() {
  const ctx = useContext(SupportChatContext);
  if (!ctx) throw new Error("useSupportChat must be used within SupportChatProvider");
  return ctx;
}
