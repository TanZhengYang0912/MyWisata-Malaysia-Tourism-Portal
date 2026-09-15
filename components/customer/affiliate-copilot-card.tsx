"use client";

// P4 — Member 4: Affiliate Copilot card. CLAUDE-AFFILIATE-COPILOT.md Part 4.
// Customer-only (a user's copilot reads only their own performance) — unlike
// AffiliateInsightCard this has no admin scope, so it's a plain component,
// not a scope-branching one. Mirrors components/shared/affiliate-insight-card.tsx's
// cache-in-localStorage + auto-generate-once + capability-gate pattern.

import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, PenLine, Copy, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { Button } from "@/components/ui/button";
import { ShareButton } from "@/components/shared/share-button";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/i18n/locale";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";

type CopilotActionKind = "share_listing" | "try_channel" | "reconsider_listing" | "general";
type CopilotMode = "llm" | "rule-based" | "no-activity";

interface CopilotAction {
  kind: CopilotActionKind;
  message: string;
  productId?: string;
  productName?: string;
  platform?: string;
}

interface CachedActions {
  actions: CopilotAction[];
  mode: CopilotMode;
}

// en/ms/zh-CN, matching the server's ChatLanguage enum used to phrase actions/captions.
const LOCALE_TO_LANG: Record<AppLocale, "en" | "bm" | "zh"> = { en: "en", ms: "bm", "zh-CN": "zh" };

function storageKey(userId: string): string {
  return `mw_affiliate_copilot_${userId}`;
}

function readCached(userId: string): CachedActions | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as CachedActions) : null;
  } catch {
    return null;
  }
}

function CaptionButton({ productId, lang }: { productId: string; lang: "en" | "bm" | "zh" }) {
  const { t } = useTranslation("vendor");
  const { showFeedback } = useActionFeedback();
  const [caption, setCaption] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function draft() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/affiliate/copilot/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, lang }),
      });
      const body = (await res.json()) as { data: { caption: string } | null };
      if (!res.ok || !body.data) {
        showFeedback("error", t("affiliate.copilot.captionFailed"));
        return;
      }
      setCaption(body.data.caption);
    } catch {
      showFeedback("error", t("affiliate.copilot.captionFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!caption) return;
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showFeedback("error", t("affiliate.copilot.captionFailed"));
    }
  }

  if (caption) {
    return (
      <div className="mt-2 rounded-lg border border-border bg-muted/40 p-2">
        <p className="text-xs text-foreground leading-relaxed">{caption}</p>
        <Button size="sm" variant="outline" className="mt-1.5" onClick={copy}>
          {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? t("affiliate.copilot.captionCopied") : t("affiliate.copilot.copyCaption")}
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={draft} disabled={loading}>
      <PenLine size={12} /> {loading ? t("affiliate.copilot.draftingCaption") : t("affiliate.copilot.draftCaption")}
    </Button>
  );
}

function ActionRow({ action, lang }: { action: CopilotAction; lang: "en" | "bm" | "zh" }) {
  return (
    <li className="rounded-lg border border-border p-3">
      <p className="text-sm text-foreground leading-relaxed">{action.message}</p>
      {action.kind === "share_listing" && action.productId && action.productName && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ShareButton shareType="product" contentId={action.productId} title={action.productName} compact />
          <CaptionButton productId={action.productId} lang={lang} />
        </div>
      )}
    </li>
  );
}

export function AffiliateCopilotCard() {
  const { currentUser, capabilities } = useAuth();
  const { t, i18n } = useTranslation("vendor");
  const gate = useCustomerCapabilityGate();
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const lang = LOCALE_TO_LANG[locale];
  const userId = currentUser?.id ?? "anon";
  const [cached, setCached] = useState<CachedActions | null>(() => readCached(userId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const capabilityAllowed = capabilities["affiliate.earn_commission"]?.allowed === true;
  const visibleCached = capabilityAllowed ? cached : null;

  async function generate() {
    if (loading) return;
    if (!gate("affiliate.earn_commission", "/customer/affiliate")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/affiliate/copilot?lang=${lang}`);
      if (await gate.handleResponse(res, "/customer/affiliate")) return;
      const body = (await res.json()) as { data: CachedActions | null; error: { message: string } | null };
      if (!res.ok || !body.data) {
        setError(body.error?.message ?? t("affiliate.copilot.generateFailed"));
        return;
      }
      setCached(body.data);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey(userId), JSON.stringify(body.data));
      }
    } catch {
      setError(t("affiliate.copilot.generateFailed"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (capabilityAllowed && !visibleCached && !loading && !error) {
      (async () => {
        await generate();
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <Sparkles size={13} /> {t("affiliate.copilot.title")}
        </p>
        <Button size="sm" variant="outline" onClick={generate} disabled={loading}>
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> {loading ? t("affiliate.copilot.generating") : t("affiliate.copilot.regenerate")}
        </Button>
      </div>

      {error && !visibleCached && <p className="text-sm text-destructive">{error}</p>}
      {!error && !visibleCached && loading && <p className="text-sm text-muted-foreground">{t("affiliate.copilot.generatingActions")}</p>}
      {visibleCached && (
        <div>
          {visibleCached.mode === "no-activity" ? (
            <p className="text-sm text-muted-foreground">{visibleCached.actions[0]?.message ?? t("affiliate.copilot.noActivity")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {visibleCached.actions.map((action, i) => (
                <ActionRow key={i} action={action} lang={lang} />
              ))}
            </ul>
          )}
          {visibleCached.mode !== "no-activity" && (
            <p className="text-[0.625rem] text-muted-foreground mt-2">
              {visibleCached.mode === "rule-based" ? t("affiliate.copilot.ruleBased") : t("affiliate.copilot.aiGenerated")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
