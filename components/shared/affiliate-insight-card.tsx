"use client";

// P4 — Member 4: AI performance insight card. CLAUDE-FUNNEL-AI.md Part 2.
// Shared between /customer/affiliate (scope="user") and /admin/affiliate
// (scope="admin") — same card, different endpoint.
//
// Cached per user+scope in localStorage so a page revisit doesn't re-call
// Gemini — only the "Regenerate" button does. Lazy useState initializer
// (not an effect) for the read, matching components/shared/chatbot-widget.tsx's
// existing pattern: this repo's React Compiler lint rule flags a synchronous
// setState inside useEffect, and there's no await here to defer past anyway.

import { useEffect, useState } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { useCustomerCapabilityGate, type CustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import type { CustomerCapability } from "@/lib/auth/customer-capabilities";

type InsightMode = "llm" | "rule-based";

interface CachedInsight {
  insight: string;
  mode: InsightMode;
  generatedAt: string;
}

type CustomerAffiliateInsightCardProps = {
  scope: "user";
  requiredCapability: CustomerCapability;
  nextPath?: string;
};

type AdminAffiliateInsightCardProps = {
  scope: "admin";
};

type AffiliateInsightCardProps = CustomerAffiliateInsightCardProps | AdminAffiliateInsightCardProps;

type AffiliateInsightCardContentProps = {
  scope: "user" | "admin";
  requiredCapability?: CustomerCapability;
  nextPath?: string;
  gate?: CustomerCapabilityGate;
};

function storageKey(scope: string, userId: string): string {
  return `mw_affiliate_insight_${scope}_${userId}`;
}

function readCached(scope: string, userId: string): CachedInsight | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(scope, userId));
    return raw ? (JSON.parse(raw) as CachedInsight) : null;
  } catch {
    return null;
  }
}

function GatedAffiliateInsightCard({ scope, requiredCapability, nextPath }: CustomerAffiliateInsightCardProps) {
  const gate = useCustomerCapabilityGate();

  return (
    <AffiliateInsightCardContent
      scope={scope}
      requiredCapability={requiredCapability}
      nextPath={nextPath}
      gate={gate}
    />
  );
}

function AffiliateInsightCardContent({ scope, requiredCapability, nextPath, gate }: AffiliateInsightCardContentProps) {
  const { currentUser, capabilities } = useAuth();
  const { t, i18n } = useTranslation("vendor");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const userId = currentUser?.id ?? "anon";
  const [cached, setCached] = useState<CachedInsight | null>(() => readCached(scope, userId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capabilityAllowed = !requiredCapability || capabilities[requiredCapability]?.allowed === true;
  const visibleCached = capabilityAllowed ? cached : null;

  const endpoint = scope === "admin" ? "/api/admin/affiliate/insight" : "/api/affiliate/insight";

  async function generate() {
    if (loading) return;
    if (requiredCapability && (!gate || !gate(requiredCapability, nextPath))) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint);
      if (requiredCapability && gate && await gate.handleResponse(res, nextPath)) return;
      const body = (await res.json()) as { data: { insight: string; mode: InsightMode } | null; error: { message: string } | null };
      if (!res.ok || !body.data) {
        setError(body.error?.message ?? t("affiliate.insight.generateFailed"));
        return;
      }
      const next: CachedInsight = { insight: body.data.insight, mode: body.data.mode, generatedAt: new Date().toISOString() };
      setCached(next);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey(scope, userId), JSON.stringify(next));
      }
    } catch {
      setError(t("affiliate.insight.generateFailed"));
    } finally {
      setLoading(false);
    }
  }

  // Auto-generate exactly once, only when there's nothing cached yet — a
  // page revisit reuses the cached result instead of calling Gemini again.
  useEffect(() => {
    if (capabilityAllowed && !visibleCached && !loading && !error) {
      (async () => {
        await generate();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, scope]);

  return (
    <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Sparkles size={13} /> {t("affiliate.insight.title")}
        </p>
        <Button size="sm" variant="outline" onClick={generate} disabled={loading}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> {loading ? t("affiliate.insight.generating") : t("affiliate.insight.regenerate")}
        </Button>
      </div>

      {error && !visibleCached && <p className="text-sm text-destructive">{error}</p>}
      {!error && !visibleCached && loading && <p className="text-sm text-muted-foreground">{t("affiliate.insight.generatingYourInsight")}</p>}
      {visibleCached && (
        <div>
          <p className="text-sm text-foreground leading-relaxed">{visibleCached.insight}</p>
          <p className="text-[0.625rem] text-muted-foreground mt-2">
            {visibleCached.mode === "rule-based" ? t("affiliate.insight.ruleBased") : t("affiliate.insight.aiGenerated")} ·{" "}
            {formatDateTime(visibleCached.generatedAt, locale)}
          </p>
        </div>
      )}
    </div>
  );
}

export function AffiliateInsightCard(props: AffiliateInsightCardProps) {
  if (props.scope === "user") {
    return <GatedAffiliateInsightCard {...props} />;
  }

  return <AffiliateInsightCardContent scope="admin" />;
}
