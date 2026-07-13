"use client";

import { useEffect, useState } from "react";
import { Star, Plus, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { CATEGORIES, STATES_MY } from "@/backend/domains/catalogue";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import type { VendorRecommendation } from "@/backend/core/types";

export default function RecommendationsPage() {
  const { currentUser } = useAuth();
  const [recs, setRecs] = useState<VendorRecommendation[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: CATEGORIES[0].id,
    state: "Kuala Lumpur",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    fetch('/api/recommendations')
      .then((r) => r.json())
      .then((body) => {
        if (body?.data) {
          setRecs(body.data.map((r: any) => ({
            id: r.id,
            submittedBy: currentUser.id,
            name: r.vendor_name,
            category: r.categories?.name ?? "",
            state: r.state ?? "",
            status: r.status,
            qualityScore: 0,
            duplicate: false,
          })));
        }
      })
      .catch(() => setRecs([]));
  }, [currentUser]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setError("");

    if (form.name.trim().length < 3) { setError("Vendor name must be at least 3 characters."); return; }
    if (form.description.trim().length < 20) { setError("Description must be at least 20 characters."); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorName:  form.name.trim(),
          description: form.description.trim(),
          categoryId:  form.category || undefined,
          state:       form.state,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error?.message ?? 'Failed to submit.');
        return;
      }
      const newRec: VendorRecommendation = {
        id:           body.data.id,
        submittedBy:  currentUser.id,
        name:         body.data.vendor_name,
        category:     form.category,
        state:        form.state,
        status:       'pending',
        qualityScore: 0,
        duplicate:    false,
      };
      setRecs((prev) => [newRec, ...(prev ?? [])]);
      setShowForm(false);
      setForm({ name: "", description: "", category: CATEGORIES[0].id, state: "Kuala Lumpur" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  }

  const pending  = (recs ?? []).filter((r) => r.status === "pending");
  const reviewed = (recs ?? []).filter((r) => r.status !== "pending");

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Star size={28} className="text-accent" />
          <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">Recommend a Vendor</h1>
        </div>
        <Button onClick={() => setShowForm((v) => !v)} className="flex items-center gap-2">
          <Plus size={15} /> Recommend
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Know a great local experience that deserves to be on MyWisata? Nominate them here — earn commission if they join.
      </p>

      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-5 mb-6 space-y-4">
          <h2 className="font-bold text-foreground">New Recommendation</h2>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vendor / Business Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Aunty Lim's Nyonya Kitchen"
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</label>
            <textarea
              required
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Describe what makes this vendor special (at least 20 characters)…"
              rows={3}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
            <p className="text-[10px] text-muted-foreground text-right">{form.description.length}/2000</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</label>
              <select
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">State</label>
              <select
                value={form.state}
                onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              >
                {STATES_MY.filter((s) => s !== "All Malaysia").map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? "Submitting…" : "Submit Recommendation"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {pending.length > 0 && (
        <div className="rounded-2xl overflow-hidden border border-border bg-card mb-4">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Clock size={14} className="text-accent" />
            <h2 className="font-bold text-foreground text-sm">Pending Review ({pending.length})</h2>
          </div>
          <div className="divide-y divide-border">
            {pending.map((r) => (
              <div key={r.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.category} · {r.state || "—"}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden border border-border bg-card">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="font-bold text-foreground text-sm">My Recommendations</h2>
        </div>
        {(recs ?? []).length === 0 ? (
          <div className="px-5 py-8 text-center">
            <Star size={32} className="text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">You haven&apos;t recommended any vendors yet.</p>
            <button onClick={() => setShowForm(true)} className="mt-3 text-sm font-semibold text-primary">
              Make your first recommendation →
            </button>
          </div>
        ) : reviewed.length === 0 ? (
          <div className="px-5 py-5 text-center text-sm text-muted-foreground">No reviewed recommendations yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {reviewed.map((r) => (
              <div key={r.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {r.status === "approved" ? (
                    <CheckCircle2 size={16} className="text-primary shrink-0" />
                  ) : (
                    <XCircle size={16} className="text-destructive shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-foreground">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.category} · {r.state || "—"}</p>
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
