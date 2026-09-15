import "server-only";

import { z } from "zod";
import { FORECAST_MAX_RESPONSE_BYTES, FORECAST_TIMEOUT_MS } from "@/lib/weather/open-meteo";
import type { RadarOverlayResult } from "@/lib/weather/types";

export const RAINVIEWER_METADATA_URL = "https://api.rainviewer.com/public/weather-maps.json";

const RADAR_FRESH_MS = 5 * 60 * 1000;
const RADAR_STALE_MS = 15 * 60 * 1000;
const MAX_CLOCK_SKEW_SECONDS = 10 * 60;
const MAX_FRAME_AGE_SECONDS = 130 * 60;

const frameSchema = z.object({
  time: z.number().int().positive(),
  path: z.string().min(1).max(160),
}).passthrough();

const metadataSchema = z.object({
  generated: z.number().int().positive(),
  host: z.string().min(1).max(240),
  radar: z.object({ past: z.array(frameSchema).max(36) }).passthrough(),
}).passthrough();

type CacheEntry = {
  value: RadarOverlayResult;
  freshUntil: number;
  staleUntil: number;
};

let completed: CacheEntry | null = null;
let inFlight: Promise<RadarOverlayResult> | null = null;

function unavailable(now: Date): RadarOverlayResult {
  return {
    availability: "unavailable",
    provider: "rainviewer",
    observedAt: null,
    fetchedAt: now.toISOString(),
    stale: false,
    tileUrlTemplate: null,
    maxZoom: 7,
    attributionLabel: "RainViewer",
    attributionUrl: "https://www.rainviewer.com/",
  };
}

async function readResponseTextWithLimit(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > FORECAST_MAX_RESPONSE_BYTES) {
    throw new Error("RainViewer response is too large");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > FORECAST_MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("RainViewer response is too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function validatedHost(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "tilecache.rainviewer.com"
    || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("RainViewer host is unsafe");
  }
  return url.origin;
}

function normalizedResult(payload: z.infer<typeof metadataSchema>, now: Date): RadarOverlayResult {
  const host = validatedHost(payload.host);
  const frame = [...payload.radar.past].sort((left, right) => right.time - left.time)[0];
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (payload.generated > nowSeconds + MAX_CLOCK_SKEW_SECONDS
    || !frame
    || frame.time > nowSeconds + MAX_CLOCK_SKEW_SECONDS
    || frame.time < nowSeconds - MAX_FRAME_AGE_SECONDS) {
    throw new Error("RainViewer frame is unavailable");
  }
  if (!/^\/v2\/radar\/[A-Za-z0-9_-]{8,64}$/.test(frame.path)) {
    throw new Error("RainViewer frame path is unsafe");
  }
  return {
    availability: "radar",
    provider: "rainviewer",
    observedAt: new Date(frame.time * 1000).toISOString(),
    fetchedAt: now.toISOString(),
    stale: false,
    tileUrlTemplate: `${host}${frame.path}/256/{z}/{x}/{y}/2/1_0.png`,
    maxZoom: 7,
    attributionLabel: "RainViewer",
    attributionUrl: "https://www.rainviewer.com/",
  };
}

export function __resetRainViewerCacheForTests() {
  completed = null;
  inFlight = null;
}

export async function getRainViewerRadar(options?: { fetcher?: typeof fetch; now?: () => Date }): Promise<RadarOverlayResult> {
  const now = options?.now?.() ?? new Date();
  const nowMs = now.getTime();
  if (completed && completed.freshUntil > nowMs) return completed.value;
  if (inFlight) return inFlight;

  const cached = completed;
  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FORECAST_TIMEOUT_MS);
    try {
      const response = await (options?.fetcher ?? fetch)(RAINVIEWER_METADATA_URL, {
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`RainViewer returned ${response.status}`);
      const parsed = metadataSchema.safeParse(JSON.parse(await readResponseTextWithLimit(response)));
      if (!parsed.success) throw new Error("RainViewer response is malformed");
      const value = normalizedResult(parsed.data, now);
      completed = {
        value,
        freshUntil: nowMs + RADAR_FRESH_MS,
        staleUntil: nowMs + RADAR_STALE_MS,
      };
      return value;
    } catch {
      if (cached && cached.staleUntil > nowMs) return { ...cached.value, stale: true };
      return unavailable(now);
    } finally {
      clearTimeout(timeout);
      inFlight = null;
    }
  })();
  inFlight = request;
  return request;
}
