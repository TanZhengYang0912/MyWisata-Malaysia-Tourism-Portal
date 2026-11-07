"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Turnstile = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

type HumanVerificationOptions = { manualRefreshAfterUse?: boolean };

export function useHumanVerification(action: string, { manualRefreshAfterUse = false }: HumanVerificationOptions = {}) {
  const proof = useRef({ action: "", token: "" });
  const [resetKey, setResetKey] = useState(0);
  const [hasVerifiedOnce, setHasVerifiedOnce] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [isRechecking, setIsRechecking] = useState(false);
  const onToken = useCallback((token: string) => {
    proof.current = { action: token ? action : "", token };
    if (!manualRefreshAfterUse) return;
    if (token) {
      setHasVerifiedOnce(true);
      setNeedsRefresh(false);
      setIsRechecking(false);
    } else {
      setNeedsRefresh(true);
      setIsRechecking(false);
    }
  }, [action, manualRefreshAfterUse]);
  const reset = useCallback(() => {
    proof.current = { action: "", token: "" };
    if (manualRefreshAfterUse) {
      setNeedsRefresh(false);
      setIsRechecking(true);
    }
    setResetKey((key) => key + 1);
  }, [manualRefreshAfterUse]);
  const takeToken = useCallback(() => {
    const token = proof.current.action === action ? proof.current.token : "";
    reset();
    return token;
  }, [action, reset]);
  return { action, manualRefreshAfterUse, resetKey, onToken, takeToken, reset, hasVerifiedOnce, needsRefresh, isRechecking };
}

type VerificationState = ReturnType<typeof useHumanVerification>;
type Appearance = "always" | "execute" | "interaction-only";
type Props = Pick<VerificationState, "action" | "resetKey" | "onToken">
  & Partial<Pick<VerificationState, "manualRefreshAfterUse" | "reset" | "needsRefresh">>
  & { showDescription?: boolean; appearance?: Appearance };

export function HumanVerification({ action, manualRefreshAfterUse = false, resetKey, onToken, reset, needsRefresh = false, showDescription = true, appearance }: Props) {
  const { t, i18n } = useTranslation("auth");
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const automaticRetryCount = useRef(0);
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const language = i18n?.resolvedLanguage?.startsWith("zh") ? "zh-CN" : i18n?.resolvedLanguage === "ms" ? "ms" : "en";
  const configured = Boolean(sitekey) && !(process.env.NODE_ENV === "production" && /^[123]x0+/.test(sitekey ?? ""));

  const retryAfterFailure = useCallback(() => {
    if (!manualRefreshAfterUse || !reset || automaticRetryCount.current >= 1) return;
    automaticRetryCount.current += 1;
    setFailed(false);
    setProviderError(null);
    reset();
  }, [manualRefreshAfterUse, reset]);

  useEffect(() => {
    if (!configured || !ready || !container.current || !window.turnstile || (manualRefreshAfterUse && needsRefresh)) return;
    let id: string | undefined;
    let active = true;
    const api = window.turnstile;
    try {
      id = api.render(container.current, {
        sitekey, action, language, theme: "auto", size: "flexible", execution: "render",
        "response-field": false,
        ...(appearance ? { appearance } : {}),
        ...(manualRefreshAfterUse ? { retry: "never", "refresh-expired": "never", "refresh-timeout": "never" } : {}),
        callback: (token: string) => { if (active) { automaticRetryCount.current = 0; setFailed(false); setProviderError(null); onToken(token); } },
        "expired-callback": () => { if (active) { if (manualRefreshAfterUse) reset?.(); else onToken(""); } },
        ...(manualRefreshAfterUse ? { "timeout-callback": () => { if (active) { onToken(""); setFailed(true); retryAfterFailure(); } } } : {}),
        // Keep only the public numeric reference code; never retain challenge tokens.
        "error-callback": (code: string) => { if (active) { onToken(""); setProviderError(/^\d{6}$/.test(code) ? code : null); setFailed(true); retryAfterFailure(); } },
      });
    } catch {
      onToken("");
      retryAfterFailure();
      queueMicrotask(() => {
        if (active) setFailed(true);
      });
    }
    return () => {
      active = false;
      if (!manualRefreshAfterUse) onToken("");
      if (id !== undefined) api.remove(id);
    };
  }, [configured, ready, sitekey, action, language, resetKey, onToken, manualRefreshAfterUse, needsRefresh, appearance, reset, retryAfterFailure]);

  return (
    <div className="space-y-2" data-human-verification={action} data-human-verification-error={failed ? providerError ?? "unavailable" : undefined}>
      {configured && <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={() => { onToken(""); setFailed(true); }}
      />}
      <div ref={container} />
      {(!configured || failed) && <p role="alert" className="text-xs text-destructive">{t("humanVerification.unavailable")}</p>}
      {showDescription && <p className="text-xs text-muted-foreground">{t("humanVerification.description")}</p>}
    </div>
  );
}
