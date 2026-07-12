"use client";

// P4 — DEV ONLY: triggers the simulated-purchase → order.paid → affiliate
// commission loop without a real checkout. Deleted at merge. See CLAUDE.md
// Step 5. At the app root (not under /customer) so it isn't blocked by the
// customer role guard.

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActivities } from "@/backend/domains/catalogue";
import { useAuth } from "@/components/providers/auth";
import { Button } from "@/components/ui/button";
import type { Activity } from "@/backend/core/types";

export default function DevPage() {
  const { currentUser, loading } = useAuth();
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  useEffect(() => {
    getActivities().then(setActivities);
  }, []);

  async function simulate(productId: string) {
    if (busyId) return; // double-submit guard
    setBusyId(productId);
    setResults((r) => ({ ...r, [productId]: "" }));
    try {
      const res = await fetch("/api/dev/simulate-purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const body = (await res.json()) as {
        data: { orderId: string } | null;
        error: { message: string } | null;
      };
      setResults((r) => ({
        ...r,
        [productId]:
          res.ok && body.data
            ? `Order ${body.data.orderId.slice(0, 8)}… created (demo).`
            : (body.error?.message ?? "Simulation failed."),
      }));
    } catch {
      setResults((r) => ({ ...r, [productId]: "Simulation failed." }));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <div className="max-w-2xl mx-auto px-6 py-16 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!currentUser) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-sm text-muted-foreground mb-4">Sign in first to simulate a purchase.</p>
        <Link href="/login" className="text-sm font-semibold text-primary underline">
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-bold text-foreground mb-1">Dev: Simulate purchase</h1>
      <p className="text-xs text-muted-foreground mb-6">
        Simulated purchase (demo only) — fakes the checkout → order.paid trigger so the affiliate
        commission flow can be tested without a real checkout. Signed in as {currentUser.name}.
      </p>

      {activities === null && <p className="text-sm text-muted-foreground">Loading activities…</p>}
      {activities?.length === 0 && <p className="text-sm text-muted-foreground">No activities found.</p>}

      <div className="space-y-3">
        {activities?.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{a.name}</p>
              <p className="text-xs text-muted-foreground">RM {a.price}</p>
            </div>
            <div className="text-right">
              <Button size="sm" disabled={busyId === a.id} onClick={() => simulate(a.id)}>
                {busyId === a.id ? "Simulating…" : "Simulate purchase (demo only)"}
              </Button>
              {results[a.id] && <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">{results[a.id]}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
