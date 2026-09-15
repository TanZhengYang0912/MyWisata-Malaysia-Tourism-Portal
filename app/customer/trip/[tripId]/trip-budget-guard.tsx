"use client";

// P4 — Member 4: Trip Budget Guard. lib/customer/budget-guard.ts.
// Moved here from the cart (per explicit direction) — the natural place to
// track a budget is while building the itinerary, not at checkout. Reuses
// the exact same POST /api/customer/budget-guard route and underlying
// evaluate/generate pipeline unchanged; only the UI and the source of
// {productId,qty} lines (this trip's real items, not cart lines) are new.
//
// The trip's real total is computed client-side from `activities` — the
// same already-loaded, server-fetched ComputedActivity[] this page already
// renders prices from everywhere else (see trip-planner-client.tsx). No new
// round-trip needed just to sum real prices already on the page; the
// server-side re-check happens anyway inside the budget-guard API route
// once the user actually asks for alternatives.

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, MapPin as MapPinIcon, PiggyBank } from "lucide-react";
import { formatMYR } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/i18n/locale";
import type { ComputedActivity } from "@/backend/core/types";
import type { TripItem } from "@/backend/domains/trips";
import type { MapPin } from "@/components/map/map-view";

const LOCALE_TO_LANG: Record<AppLocale, "en" | "bm" | "zh"> = { en: "en", ms: "bm", "zh-CN": "zh" };

interface BudgetGuardMessage {
  originalProductId: string;
  originalName: string;
  alternativeProductId: string;
  alternativeName: string;
  savingsRM: number;
  message: string;
  /** The alternative's own real coordinate/image — plots on the map, never invented. */
  alternativeLat: number;
  alternativeLng: number;
  alternativeImage: string | null;
}

interface BudgetGuardApiResult {
  result: { totalRM: number; budgetRM: number; isOverBudget: boolean; overBudgetByRM: number };
  messages: BudgetGuardMessage[];
  mode: "llm" | "rule-based" | "within-budget";
}

function storageKey(tripId: string): string {
  return `mw_trip_budget_${tripId}`;
}

function readStoredBudget(tripId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(tripId));
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function TripBudgetGuard({
  tripId,
  items,
  activities,
  onShowOnMap,
}: {
  tripId: string;
  items: TripItem[];
  activities: ComputedActivity[] | null;
  /** Focuses the alternative's real pin on the map view and switches the panel there — mirrors the same "show on map" action the Places list already offers. */
  onShowOnMap?: (pin: MapPin) => void;
}) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const lang = LOCALE_TO_LANG[locale];

  const [budget, setBudget] = useState<number | null>(() => readStoredBudget(tripId));
  const [editing, setEditing] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BudgetGuardApiResult | null>(null);

  const priceById = useMemo(() => new Map((activities ?? []).map((activity) => [activity.id, activity.price])), [activities]);
  const total = useMemo(
    () => items.reduce((sum, item) => (item.experience_id ? sum + (priceById.get(item.experience_id) ?? 0) : sum), 0),
    [items, priceById],
  );
  const overBudgetByRM = budget !== null ? Math.max(0, total - budget) : 0;
  const isOverBudget = overBudgetByRM > 0;

  function saveBudget() {
    const parsed = Number(budgetInput);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    setBudget(parsed);
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey(tripId), String(parsed));
    setEditing(false);
  }

  async function checkSuggestions() {
    setExpanded(true);
    if (loading || budget === null) return;
    // Always re-fetch on click rather than caching — the trip may have
    // changed (item added/removed) since the last check, and re-deriving
    // "is my cached result still fresh" would need an effect that reacts to
    // total/budget, which the React Compiler lint rule flags as a
    // cascading-render risk. A manual click is cheap to just re-run for real.
    setLoading(true);
    setError(null);
    try {
      const lines = items.filter((item) => item.experience_id).map((item) => ({ productId: item.experience_id as string, qty: 1 }));
      const res = await fetch("/api/customer/budget-guard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines, budgetRM: budget, lang }),
      });
      const body = (await res.json()) as { data: BudgetGuardApiResult | null; error: { message: string } | null };
      if (!res.ok || !body.data) {
        setError(body.error?.message ?? t("ui.tripBudget.checkFailed"));
        return;
      }
      setData(body.data);
    } catch {
      setError(t("ui.tripBudget.checkFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-3 rounded-2xl border border-border bg-secondary/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-foreground">
          <PiggyBank size={14} className="text-primary" /> {t("ui.tripBudget.title")}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => { setBudgetInput(budget ? String(budget) : ""); setEditing(true); }}
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            {budget === null ? t("ui.tripBudget.setBudget") : t("ui.tripBudget.edit")}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("ui.tripBudget.currencyPrefix")}</span>
          <input
            type="number"
            min="0"
            step="1"
            autoFocus
            value={budgetInput}
            onChange={(event) => setBudgetInput(event.target.value)}
            placeholder={t("ui.tripBudget.budgetPlaceholder")}
            className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
          />
          <button type="button" onClick={saveBudget} className="rounded-lg bg-primary px-2 py-1 text-[11px] font-bold text-white">{t("ui.tripBudget.save")}</button>
          <button type="button" onClick={() => setEditing(false)} className="text-[11px] font-semibold text-muted-foreground">{t("ui.tripBudget.cancel")}</button>
        </div>
      ) : budget !== null ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{t("ui.tripBudget.spentOfBudget", { spent: formatMYR(total), budget: formatMYR(budget) })}</p>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">{t("ui.tripBudget.noBudgetSet")}</p>
      )}

      {isOverBudget && (
        <button
          type="button"
          onClick={checkSuggestions}
          className="mt-2 flex w-full items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-left text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
        >
          <AlertTriangle size={13} className="shrink-0" />
          {t("ui.tripBudget.overBudgetWarning", { amount: formatMYR(overBudgetByRM) })}
        </button>
      )}

      {expanded && (
        <div className="mt-2">
          {loading && <p className="text-[11px] text-muted-foreground">{t("ui.tripBudget.checking")}</p>}
          {error && !loading && <p className="text-[11px] text-destructive">{error}</p>}
          {data && !loading && data.messages.length === 0 && <p className="text-[11px] text-muted-foreground">{t("ui.tripBudget.noAlternatives")}</p>}
          {data && data.messages.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {data.messages.map((message) => (
                <li key={`${message.originalProductId}-${message.alternativeProductId}`} className="rounded-lg border border-border bg-background p-2">
                  <p className="text-[11px] leading-relaxed text-foreground">{message.message}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-primary">{t("ui.tripBudget.savings", { amount: formatMYR(message.savingsRM) })}</span>
                    <div className="flex items-center gap-2">
                      {onShowOnMap && (
                        <button
                          type="button"
                          onClick={() => onShowOnMap({
                            id: message.alternativeProductId,
                            lat: message.alternativeLat,
                            lng: message.alternativeLng,
                            label: message.alternativeName,
                            sublabel: t("ui.tripBudget.savings", { amount: formatMYR(message.savingsRM) }),
                            href: `/customer/activity/${message.alternativeProductId}`,
                            imageUrl: message.alternativeImage,
                            replacesId: message.originalProductId,
                          })}
                          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary hover:underline"
                        >
                          <MapPinIcon size={11} /> {t("ui.tripBudget.showOnMap")}
                        </button>
                      )}
                      <a href={`/customer/activity/${message.alternativeProductId}`} className="text-[10px] font-semibold text-primary hover:underline">{t("ui.tripBudget.viewAlternative")}</a>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
