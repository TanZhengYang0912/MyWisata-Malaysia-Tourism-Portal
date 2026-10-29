"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

type Turnstile = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global { interface Window { turnstile?: Turnstile } }

export function useHumanVerification(action: string) {
  const proof = useRef({ action: "", token: "" });
  const [resetKey, setResetKey] = useState(0);
  const onToken = useCallback((token: string) => { proof.current = { action, token }; }, [action]);
  const reset = useCallback(() => {
    proof.current = { action: "", token: "" };
    setResetKey((key) => key + 1);
  }, []);
  const takeToken = useCallback(() => {
    const token = proof.current.action === action ? proof.current.token : "";
    reset();
    return token;
  }, [action, reset]);
  return { action, resetKey, onToken, takeToken, reset };
}

type Props = Pick<ReturnType<typeof useHumanVerification>, "action" | "resetKey" | "onToken">;

export function HumanVerification({ action, resetKey, onToken }: Props) {
  const { t, i18n } = useTranslation("auth");
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const language = i18n?.resolvedLanguage?.startsWith("zh") ? "zh-CN" : i18n?.resolvedLanguage === "ms" ? "ms" : "en";
  const configured = Boolean(sitekey) && !(process.env.NODE_ENV === "production" && /^[123]x0+/.test(sitekey ?? ""));

  useEffect(() => {
    if (!configured || !ready || !container.current || !window.turnstile) return;
    let id: string | undefined;
    let active = true;
    const api = window.turnstile;
    try {
      id = api.render(container.current, {
        sitekey, action, language, theme: "auto", size: "flexible",
        "response-field": false,
        callback: (token: string) => { if (active) { setFailed(false); setProviderError(null); onToken(token); } },
        "expired-callback": () => { if (active) onToken(""); },
        // Keep only the public numeric reference code; never retain challenge tokens.
        "error-callback": (code: string) => { if (active) { onToken(""); setProviderError(/^\d{6}$/.test(code) ? code : null); setFailed(true); } },
      });
    } catch {
      onToken("");
      queueMicrotask(() => {
        if (active) setFailed(true);
      });
    }
    return () => {
      active = false;
      onToken("");
      if (id !== undefined) api.remove(id);
    };
  }, [configured, ready, sitekey, action, language, resetKey, onToken]);

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
      <p className="text-xs text-muted-foreground">{t("humanVerification.description")}</p>
    </div>
  );
}
