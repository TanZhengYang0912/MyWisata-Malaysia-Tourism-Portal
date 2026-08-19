"use client";

// Single preferences editor used by the standalone Preferences slot
// (app/customer/preferences), the onboarding wizard, and the profile settings
// card — one source of truth for the §11.1 form. Loads current answers from
// GET /api/profile/survey and saves via POST (which also promotes tier when
// onboarding criteria are met).

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  INTEREST_OPTIONS, TRAVEL_STYLES, GROUP_COMPOSITIONS,
  BUDGET_RANGES, MOBILITY_NEEDS, DISTANCE_OPTIONS,
} from "@/backend/domains/preferences";
import { getDiscoveryCategoryLabel, normalizeCategorySlugs } from "@/lib/customer/discovery-categories";

type SurveyResponse = {
  interests: string[] | null;
  travel_style: string | null;
  budget_range: string | null;
  mobility_needs: string | null;
  group_composition: string[] | null;
  pet_friendly: boolean | null;
  preferred_radius_km: number | null;
  notes: string | null;
  learned_affinity: Record<string, number> | null;
} | null;

const interestLabel = (slug: string) => getDiscoveryCategoryLabel(slug);

export function PreferencesEditor({ onSaved, submitLabel }: { onSaved?: () => void; submitLabel?: string }) {
  const { t } = useTranslation("customer");
  const [interests, setInterests] = useState<string[]>([]);
  const [travelStyle, setTravelStyle] = useState("mid_range");
  const [budgetRange, setBudgetRange] = useState("mid_range");
  const [mobilityNeeds, setMobilityNeeds] = useState("none");
  const [group, setGroup] = useState<string[]>([]);
  const [petFriendly, setPetFriendly] = useState(false);
  const [radiusKm, setRadiusKm] = useState(20);
  const [notes, setNotes] = useState("");
  const [learned, setLearned] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/profile/survey", { cache: "no-store" })
      .then((r) => r.json())
      .then((body: { data?: SurveyResponse }) => {
        if (!active) return;
        const s = body.data;
        if (s) {
          setInterests(normalizeCategorySlugs(s.interests));
          setTravelStyle(s.travel_style ?? "mid_range");
          setBudgetRange(s.budget_range ?? "mid_range");
          setMobilityNeeds(s.mobility_needs ?? "none");
          setGroup(s.group_composition ?? []);
          setPetFriendly(Boolean(s.pet_friendly));
          setRadiusKm(s.preferred_radius_km ?? 20);
          setNotes(s.notes ?? "");
          setLearned(s.learned_affinity ?? {});
        }
      })
      .catch(() => { /* first-time users have no row — defaults are fine */ })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  async function save() {
    if (interests.length === 0) { setError(t("ui.preferencesEditor.selectInterest")); return; }
    setBusy(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/profile/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interests, travelStyle, budgetRange, mobilityNeeds,
          groupComposition: group, petFriendly, preferredRadiusKm: radiusKm,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as { error?: { message?: string } })?.error?.message ?? t("ui.preferencesEditor.saveError"));
      }
      setSaved(true);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("ui.preferencesEditor.saveError"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="py-8 text-center text-sm text-muted-foreground">{t("ui.preferencesEditor.loading")}</p>;

  const topLearned = Object.entries(learned).sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <div className="space-y-5">
      {topLearned.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Sparkles size={13} /> {t("ui.preferencesEditor.basedOnActivity")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("ui.preferencesEditor.learnedHint", { interests: topLearned.map(([slug]) => interestLabel(slug)).join(", ") })}</p>
        </div>
      )}

      <Field label={t("ui.preferencesEditor.interests")}>
        <div className="flex flex-wrap gap-2">
          {INTEREST_OPTIONS.map(({ slug, label }) => {
            const sel = interests.includes(slug);
            return <Chip key={slug} selected={sel} onClick={() => toggle(interests, setInterests, slug)}>{label}</Chip>;
          })}
        </div>
      </Field>

      <Field label={t("ui.preferencesEditor.travelStyle")}>
        <div className="grid grid-cols-2 gap-2">
          {TRAVEL_STYLES.map(({ value, label }) => <Option key={value} selected={travelStyle === value} onClick={() => setTravelStyle(value)}>{label}</Option>)}
        </div>
      </Field>

      <Field label={t("ui.preferencesEditor.travelling")}>
        <div className="flex flex-wrap gap-2">
          {GROUP_COMPOSITIONS.map(({ value, label }) => <Chip key={value} selected={group.includes(value)} onClick={() => toggle(group, setGroup, value)}>{label}</Chip>)}
        </div>
      </Field>

      <Field label={t("ui.preferencesEditor.budgetRange")}>
        <div className="space-y-1.5">
          {BUDGET_RANGES.map(({ value, label }) => <Row key={value} selected={budgetRange === value} onClick={() => setBudgetRange(value)}>{label}</Row>)}
        </div>
      </Field>

      <Field label={t("ui.preferencesEditor.preferredDistance")}>
        <div className="grid grid-cols-2 gap-2">
          {DISTANCE_OPTIONS.map(({ value, label }) => <Option key={value} selected={radiusKm === value} onClick={() => setRadiusKm(value)}>{label}</Option>)}
        </div>
      </Field>

      <Field label={t("ui.preferencesEditor.mobilityAccessibility")}>
        <div className="space-y-1.5">
          {MOBILITY_NEEDS.map(({ value, label }) => <Row key={value} selected={mobilityNeeds === value} onClick={() => setMobilityNeeds(value)}>{label}</Row>)}
        </div>
        <button
          type="button"
          onClick={() => setPetFriendly((v) => !v)}
          className="mt-1.5 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors"
          style={{
            backgroundColor: petFriendly ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
            borderColor: petFriendly ? "var(--primary)" : "var(--border)",
            color: petFriendly ? "var(--primary)" : "var(--foreground)",
            fontWeight: petFriendly ? 600 : 400,
          }}
        >
          {petFriendly && <CheckCircle2 size={13} />} {t("ui.preferencesEditor.petFriendly")}
        </button>
      </Field>

      <Field label={t("ui.preferencesEditor.anythingElse")}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder={t("ui.preferencesEditor.notesPlaceholder")}
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
      </Field>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {saved && <p className="text-xs text-primary">{t("ui.preferencesEditor.saved")}</p>}
      <Button onClick={save} disabled={busy || interests.length === 0} className="w-full">
        {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
        {busy ? t("ui.preferencesEditor.saving") : (submitLabel ?? t("ui.preferencesEditor.save"))}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>{children}</div>;
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors" style={{ backgroundColor: selected ? "var(--primary)" : "transparent", borderColor: selected ? "var(--primary)" : "var(--border)", color: selected ? "white" : "var(--foreground)" }}>{children}</button>;
}

function Option({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="rounded-xl border px-3 py-2 text-left text-sm transition-colors" style={{ backgroundColor: selected ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent", borderColor: selected ? "var(--primary)" : "var(--border)", color: selected ? "var(--primary)" : "var(--foreground)", fontWeight: selected ? 600 : 400 }}>{children}</button>;
}

function Row({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition-colors" style={{ backgroundColor: selected ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent", borderColor: selected ? "var(--primary)" : "var(--border)", color: selected ? "var(--primary)" : "var(--foreground)", fontWeight: selected ? 600 : 400 }}>{selected && <CheckCircle2 size={13} />}{children}</button>;
}
