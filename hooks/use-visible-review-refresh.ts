"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type VisibleReviewRefreshOptions = {
  enabled: boolean;
  onRefresh: (signal: AbortSignal) => Promise<unknown> | unknown;
  intervalMs?: number | null;
  identityKey?: string | null;
  refreshKey?: unknown;
  initialRefresh?: boolean;
  coalesceMs?: number;
};

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_INTERVAL_MS = 120_000;

/** Refresh a bounded review list only while visible; serialize and back off failing reads. */
export function useVisibleReviewRefresh({
  enabled,
  onRefresh,
  intervalMs = 30_000,
  identityKey,
  refreshKey,
  initialRefresh = false,
  coalesceMs = 0,
}: VisibleReviewRefreshOptions) {
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  const [hasRefreshError, setHasRefreshError] = useState(false);
  const manualRef = useRef<(() => Promise<void>) | null>(null);
  const invalidateRef = useRef<((verified: boolean) => void) | null>(null);
  const refresh = useCallback(() => {
    if (invalidateRef.current) invalidateRef.current(true);
    else void manualRef.current?.();
  }, []);
  const refreshRef = useRef(onRefresh);

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled || intervalMs === null) return;

    let isMounted = true;
    let timer: number | null = null;
    let timeout: number | null = null;
    let inFlight = false;
    let failureCount = 0;
    let controller: AbortController | null = null;
    let accessDenied = false;

    const isVisible = () => document.visibilityState === "visible";
    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      clearTimer();
      if (!isMounted || !isVisible() || inFlight || accessDenied) return;
      const delay = Math.min(intervalMs * (2 ** failureCount), MAX_INTERVAL_MS);
      timer = window.setTimeout(() => { void runRefresh(); }, delay);
    };
    const runRefresh = async () => {
      clearTimer();
      if (!isMounted || !isVisible() || inFlight || accessDenied) return;
      inFlight = true;
      controller = new AbortController();
      const activeController = controller;
      timeout = window.setTimeout(() => activeController.abort(), REQUEST_TIMEOUT_MS);
      try {
        await refreshRef.current(activeController.signal);
        if (!activeController.signal.aborted) { failureCount = 0; if (isMounted) { setLastSuccessAt(Date.now()); setHasRefreshError(false); } }
        else failureCount += 1;
      } catch (error) {
        if (error && typeof error === "object" && "status" in error && (error.status === 401 || error.status === 403)) accessDenied = true;
        if (isMounted) setHasRefreshError(true);
        failureCount += 1;
      } finally {
        if (timeout !== null) window.clearTimeout(timeout);
        timeout = null;
        if (controller === activeController) controller = null;
        inFlight = false;
        schedule();
      }
    };
    manualRef.current = async () => { accessDenied = false; await runRefresh(); };
    const onVisibilityChange = () => {
      if (!isVisible()) {
        clearTimer();
        return;
      }
      void runRefresh();
    };
    const onFocus = () => { void runRefresh(); };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    schedule();

    return () => {
      isMounted = false;
      manualRef.current = null;
      clearTimer();
      if (timeout !== null) window.clearTimeout(timeout);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, intervalMs]);

  // Customer reads are event-driven. Keep legacy review polling unchanged.
  useEffect(() => {
    if (!enabled || intervalMs !== null) return;
    let mounted = true;
    let timer: number | null = null;
    let timeout: number | null = null;
    let controller: AbortController | null = null;
    let inFlight = false;
    let dirty = false;
    let accessDenied = false;
    let verifiedGeneration = 0;
    const visible = () => document.visibilityState === 'visible';
    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const schedule = () => {
      if (!mounted || !dirty || !visible() || inFlight || accessDenied) return;
      clearTimer();
      timer = window.setTimeout(() => { void run(); }, coalesceMs);
    };
    const run = async () => {
      clearTimer();
      if (!mounted || !visible() || inFlight || accessDenied) return;
      dirty = false;
      inFlight = true;
      const generation = verifiedGeneration;
      const activeController = new AbortController();
      controller = activeController;
      try {
        // Race the deadline as well as aborting: an abort-ignoring callback
        // must not permanently prevent future invalidations from being read.
        await Promise.race([
          Promise.resolve().then(() => refreshRef.current(activeController.signal)),
          new Promise<never>((_, reject) => {
            timeout = window.setTimeout(() => {
              activeController.abort();
              reject(new Error('Refresh timed out'));
            }, REQUEST_TIMEOUT_MS);
          }),
        ]);
        if (mounted && !activeController.signal.aborted) {
          setLastSuccessAt(Date.now());
          setHasRefreshError(false);
        }
      } catch (error) {
        if (generation === verifiedGeneration && error && typeof error === 'object' && 'status' in error && (error.status === 401 || error.status === 403)) accessDenied = true;
        if (mounted) setHasRefreshError(true);
      } finally {
        if (timeout !== null) window.clearTimeout(timeout);
        timeout = null;
        if (controller === activeController) controller = null;
        inFlight = false;
        schedule();
      }
    };
    const invalidate = (verified: boolean) => {
      if (verified) { verifiedGeneration += 1; accessDenied = false; }
      dirty = true;
      schedule();
    };
    invalidateRef.current = invalidate;
    const onVisibility = () => {
      if (!visible()) { clearTimer(); return; }
      invalidate(false);
    };
    const onFocus = () => { invalidate(false); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    if (initialRefresh) invalidate(false);
    return () => {
      mounted = false;
      invalidateRef.current = null;
      clearTimer();
      if (timeout !== null) window.clearTimeout(timeout);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, intervalMs, identityKey, initialRefresh, coalesceMs]);

  useEffect(() => {
    if (refreshKey !== undefined) invalidateRef.current?.(true);
  }, [refreshKey]);
  return { lastSuccessAt, hasRefreshError, refresh };
}
