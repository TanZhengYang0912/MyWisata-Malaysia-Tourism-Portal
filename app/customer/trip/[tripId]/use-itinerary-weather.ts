"use client";

import { useEffect, useMemo, useState } from "react";
import type { WeatherBatchResponse, WeatherTarget } from "@/lib/weather/types";

export type ItineraryWeatherState = {
  status: "idle" | "loading" | "ready" | "error";
  results: WeatherBatchResponse["results"];
};

function isResults(value: unknown): value is WeatherBatchResponse["results"] {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function useItineraryWeather(tripId: string, targets: WeatherTarget[]): ItineraryWeatherState {
  const requestFingerprint = useMemo(
    () => `${tripId}|${targets.map((target) => target.key).sort().join("|")}`,
    [targets, tripId],
  );
  const [state, setState] = useState<ItineraryWeatherState>({ status: "idle", results: {} });

  useEffect(() => {
    if (targets.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "idle", results: {} });
      return;
    }

    const controller = new AbortController();
    let active = true;
    // Clear results immediately so a previous city's forecast cannot remain on a new day anchor.
    setState({ status: "loading", results: {} });

    void fetch("/api/weather/forecast", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tripId, targets }),
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Forecast request unavailable");
        const body = await response.json() as { data?: { results?: unknown } };
        if (!isResults(body.data?.results)) throw new Error("Forecast response malformed");
        if (!active) return;
        setState({ status: "ready", results: body.data.results });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !active) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setState({ status: "error", results: {} });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [requestFingerprint, targets, tripId]);

  return state;
}
