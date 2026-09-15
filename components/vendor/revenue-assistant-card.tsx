"use client";

// P4 — Member 4: AI Vendor Revenue Assistant card. CLAUDE-VENDOR-REVENUE-ASSISTANT.md Part 5.
// Mirrors components/shared/affiliate-insight-card.tsx / affiliate-copilot-card.tsx's
// cache-in-localStorage + auto-generate-once pattern. No capability gate here
// (unlike the customer-facing cards) — by the time this renders, the vendor
// dashboard page itself has already redirected any non-vendor to /login, and
// the API route independently re-checks vendor scope server-side anyway.

import { useEffect, useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/i18n/locale";

type VendorRevenueMode = "llm" | "rule-based" | "no-data";

interface VendorRevenueAction {
  kind: "incomplete_listing" | "promo_timing" | "quality_attention";
  message: string;
  productId?: string;
  productName?: string;
}

interface CachedResult {
  actions: VendorRevenueAction[];
  mode: VendorRevenueMode;
}

// en/ms/zh-CN, matching the server's ChatLanguage enum used to phrase actions.
const LOCALE_TO_LANG: Record<AppLocale, "en" | "bm" | "zh"> = { en: "en", ms: "bm", "zh-CN": "zh" };

function storageKey(userId: string): string {
  return `mw_vendor_revenue_assistant_${userId}`;
}

function readCached(userId: string): CachedResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as CachedResult) : null;
  } catch {
    return null;
  }
}

export function VendorRevenueAssistantCard() {
  const { currentUser } = useAuth();
  const { t, i18n } = useTranslation("vendor");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const lang = LOCALE_TO_LANG[locale];
  const userId = currentUser?.id ?? "anon";
  const [cached, setCached] = useState<CachedResult | null>(() => readCached(userId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/vendor/revenue-assistant?lang=${lang}`);
      const body = (await res.json()) as { data: CachedResult | null; error: { message: string } | null };
      if (!res.ok || !body.data) {
        setError(body.error?.message ?? t("ui.revenueAssistant.generateFailed"));
        return;
      }
      setCached(body.data);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey(userId), JSON.stringify(body.data));
      }
    } catch {
      setError(t("ui.revenueAssistant.generateFailed"));
    } finally {
      setLoading(false);
    }
  }

  // Auto-generate exactly once, only when there's nothing cached yet.
  useEffect(() => {
    if (!cached && !loading && !error) {
      (async () => {
        await generate();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const hasActions = Boolean(cached && cached.mode !== "no-data" && cached.actions.length > 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-gray-100 bg-gray-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-primary" />
          <h2 className="text-lg font-semibold text-gray-900">{t("ui.revenueAssistant.title")}</h2>
        </div>
        <Button size="sm" variant="outline" onClick={generate} disabled={loading}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> {loading ? t("ui.revenueAssistant.generating") : t("ui.revenueAssistant.regenerate")}
        </Button>
      </div>

      <div className="p-5">
        {error && !cached && <p className="text-sm text-red-600">{error}</p>}
        {!error && !cached && loading && <p className="text-sm text-gray-500">{t("ui.revenueAssistant.generatingActions")}</p>}
        {cached && (
          <div>
            {hasActions ? (
              <ul className="flex flex-col gap-2">
                {cached.actions.map((action, index) => (
                  <li key={`${action.productId ?? "action"}-${index}`} className="rounded-xl border border-gray-100 p-3">
                    <p className="text-sm leading-relaxed text-gray-900">{action.message}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">{t("ui.revenueAssistant.noData")}</p>
            )}
            {hasActions && (
              <p className="mt-2 text-[0.625rem] text-gray-500">
                {cached.mode === "rule-based" ? t("ui.revenueAssistant.ruleBased") : t("ui.revenueAssistant.aiGenerated")}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
