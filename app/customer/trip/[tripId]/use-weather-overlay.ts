"use client";

import { useEffect, useMemo, useState } from "react";
import type { WeatherOverlayResult } from "@/lib/weather/types";

export type WeatherOverlayStatus = "idle" | "loading" | "ready" | "error" | "missing_coordinates";

type OverlayState = {
  status: WeatherOverlayStatus;
  result: WeatherOverlayResult | null;
  requestFingerprint: string;
};

export function useWeatherOverlay(
  tripId: string,
  date: string | null,
  hour: number,
  enabled: boolean,
  hasCoordinates: boolean,
  geographyKey: string,
): Omit<OverlayState, "requestFingerprint"> {
  const requestFingerprint = useMemo(() => `${tripId}|${date ?? ""}|${hour}|${enabled}|${hasCoordinates}|${geographyKey}`, [date, enabled, geographyKey, hasCoordinates, hour, tripId]);
  const [state, setState] = useState<OverlayState>({ status: "idle", result: null, requestFingerprint: "" });

  useEffect(() => {
    if (!enabled || !date || !hasCoordinates) return;

    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(async () => {
      setState({ status: "loading", result: null, requestFingerprint });
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
            if (active) setState({ status: "missing_coordinates", result: null, requestFingerprint });
            return;
          }
          throw new Error("Weather overlay unavailable");
        }
        if (!active) return;
        setState({ status: "ready", result: body.data, requestFingerprint });
      } catch {
        if (controller.signal.aborted || !active) return;
        setState({ status: "error", result: null, requestFingerprint });
      }
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [date, enabled, hasCoordinates, hour, requestFingerprint, tripId]);

  if (!enabled || !date) return { status: "idle", result: null };
  if (!hasCoordinates) return { status: "missing_coordinates", result: null };
  return state.requestFingerprint === requestFingerprint
    ? state
    : { status: "loading", result: null };
}
