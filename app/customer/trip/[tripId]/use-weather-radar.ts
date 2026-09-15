"use client";

import { useEffect, useState } from "react";
import type { RadarOverlayResult } from "@/lib/weather/types";

type RadarState = {
  status: "idle" | "loading" | "ready" | "error";
  result: RadarOverlayResult | null;
};

const RADAR_REFRESH_MS = 5 * 60 * 1000;

export function useWeatherRadar(tripId: string, enabled: boolean) {
  const [state, setState] = useState<RadarState>({ status: "idle", result: null });

  useEffect(() => {
    if (!enabled) {
      const resetTimer = window.setTimeout(() => setState({ status: "idle", result: null }), 0);
      return () => window.clearTimeout(resetTimer);
    }

    const controller = new AbortController();
    let active = true;
    let loading = false;
    let lastRequestedAt = 0;
    const load = async () => {
      if (loading) return;
      loading = true;
      lastRequestedAt = Date.now();
      setState((current) => ({ status: "loading", result: current.result }));
      try {
        const response = await fetch(`/api/weather/radar?tripId=${encodeURIComponent(tripId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as { data?: RadarOverlayResult | null };
        if (!response.ok || !body.data) throw new Error("Live radar unavailable");
        if (!active) return;
        setState({ status: "ready", result: body.data });
      } catch {
        if (controller.signal.aborted || !active) return;
        setState({ status: "error", result: null });
      } finally {
        loading = false;
      }
    };

    const initialTimer = window.setTimeout(() => void load(), 80);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, RADAR_REFRESH_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRequestedAt >= RADAR_REFRESH_MS) void load();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      controller.abort();
    };
  }, [enabled, tripId]);

  return state;
}
