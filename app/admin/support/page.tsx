"use client";

import { useEffect, useState } from "react";
import { getSupportTickets, getUser, resolveTicket } from "@/lib/db/repos/identity";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import type { SupportTicket } from "@/lib/types";

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  useEffect(() => {
    setTickets(getSupportTickets());
  }, []);

  function resolve(id: string) {
    resolveTicket(id);
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status: "resolved" as const } : t)));
  }

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-6">Support Tickets</h1>
      {tickets.length === 0 ? (
        <EmptyState title="No support tickets" />
      ) : (
        <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
          <div className="divide-y divide-border">
            {tickets.map((t) => {
              const user = getUser(t.userId);
              return (
                <div key={t.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{t.subject}</p>
                    <p className="text-xs text-muted-foreground">{t.category} · from {user?.name}</p>
                  </div>
                  {t.status === "open" ? (
                    <>
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-accent/25 text-[#B08020] shrink-0">Open</span>
                      <Button size="sm" variant="outline" onClick={() => resolve(t.id)} className="shrink-0">Mark Resolved</Button>
                    </>
                  ) : (
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/15 text-primary shrink-0">Resolved</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
