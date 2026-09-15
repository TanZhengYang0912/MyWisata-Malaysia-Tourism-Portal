"use client";

import { useEffect, useMemo, useState } from "react";
import type { WeatherOverlayResult } from "@/lib/weather/types";

export type WeatherOverlayStatus = "idle" | "loading" | "ready" | "error" | "missing_coordinates";

type OverlayState = {
  status: WeatherOverlayStatus;
  result: WeatherOverlayResult | null;
};

export function useWeatherOverlay(tripId: string, date: string | null, hour: number, enabled: boolean, hasCoordinates = true) {
  const requestFingerprint = useMemo(() => `${tripId}|${date ?? ""}|${hour}|${enabled}|${hasCoordinates}`, [date, enabled, hasCoordinates, hour, tripId]);
  const [state, setState] = useState<OverlayState>({ status: "idle", result: null });

  useEffect(() => {
    if (!enabled || !date) {
      setState({ status: "idle", result: null });
      return;
    }
    if (!hasCoordinates) {
      setState({ status: "missing_coordinates", result: null });
      return;
    }

    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(async () => {
      setState((current) => ({ status: "loading", result: current.result?.date === date ? current.result : null }));
      try {
        const response = await fetch("/api/weather/overlay", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId, date, hour }),
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          data?: WeatherOverlayResult | null;
          error?: { code?: string } | null;
        };
        if (!response.ok || !body.data) {
          if (body.error?.code === "NO_VALID_COORDINATES") {
            if (active) setState({ status: "missing_coordinates", result: null });
            return;
          }
          throw new Error("Weather overlay unavailable");
        }
        if (!active) return;
        setState({ status: "ready", result: body.data });
      } catch (error) {
        if (controller.signal.aborted || !active) return;
        setState({ status: "error", result: null });
      }
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [date, enabled, hasCoordinates, hour, requestFingerprint, tripId]);

  return state;
}
