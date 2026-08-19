"use client";

// P4 — CLAUDE-SUPPORT-MUTE-REPORT.md Feature 3: the report button, generic
// across chat surfaces. Calls the Feature 4 destination (POST
// /api/conduct/report) directly — reused on the user<->admin ticket thread
// (both the customer's and the admin's view). Not used on the user<->vendor
// chat surface: that surface already has its own working "Report
// conversation" flow (components/customer/chat-thread-panel.tsx, into the
// pre-existing chat_reports table with reporter-reputation/ban tooling) —
// left untouched rather than rewired, see the conduct panel's summary for
// why. vendor_admin has no real chat surface yet (confirmed by search), so
// nothing calls this with that chatType today.

import { useState } from "react";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/providers/action-feedback";

interface ReportChatButtonProps {
  chatType: "user_vendor" | "user_admin" | "vendor_admin";
  threadId: string;
  className?: string;
}

export function ReportChatButton({ chatType, threadId, className }: ReportChatButtonProps) {
  const { showFeedback } = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [reported, setReported] = useState(false);

  async function submit() {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/conduct/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatType, threadId, reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showFeedback("error", body?.error?.message ?? "Could not submit report.");
        return;
      }
      setReported(true);
      setOpen(false);
      showFeedback("success", "Reported. Our team will review it.");
    } catch {
      showFeedback("error", "Could not submit report. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (reported) {
    return <span className={`text-xs text-muted-foreground ${className ?? ""}`}>Reported</span>;
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
        aria-label="Report this conversation"
        title="Report"
      >
        <Flag size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-20 w-64 rounded-2xl border border-border bg-card p-3 shadow-lg">
          <p className="mb-2 text-sm font-semibold text-foreground">Report this conversation</p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            rows={2}
            maxLength={500}
            className="mb-2 w-full resize-none rounded-xl border border-border bg-background px-2.5 py-2 text-xs text-foreground"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" className="flex-1" disabled={sending} onClick={() => void submit()}>
              {sending ? "Submitting…" : "Submit report"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
