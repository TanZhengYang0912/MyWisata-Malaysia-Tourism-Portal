"use client";

import { SlidersHorizontal } from "lucide-react";
import { PreferencesEditor } from "@/components/profile/preferences-editor";

export default function PreferencesPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <SlidersHorizontal size={13} /> Preferences
        </p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">Your travel preferences</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          These shape your “Recommended For You” feed. Update them anytime — the more we know, the better the suggestions.
        </p>
      </header>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <PreferencesEditor />
      </div>
    </main>
  );
}
