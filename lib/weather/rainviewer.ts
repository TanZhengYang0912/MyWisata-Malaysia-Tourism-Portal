import "server-only";

import { z } from "zod";
import { FORECAST_MAX_RESPONSE_BYTES, FORECAST_TIMEOUT_MS } from "@/lib/weather/open-meteo";
import { startSharedProviderRequest, subscribeToSharedProviderRequest, type SharedProviderRequest } from "@/lib/weather/shared-provider-request";
import type { RadarFrame, RadarOverlayResult } from "@/lib/weather/types";

export const RAINVIEWER_METADATA_URL = "https://api.rainviewer.com/public/weather-maps.json";

const RADAR_FRESH_MS = 5 * 60 * 1000;
const RADAR_STALE_MS = 15 * 60 * 1000;
const MAX_CLOCK_SKEW_SECONDS = 10 * 60;
const MAX_FRAME_AGE_SECONDS = 130 * 60;
const MAX_PLAYBACK_FRAMES = 12;

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
let inFlight: SharedProviderRequest<RadarOverlayResult> | null = null;

function unavailable(now: Date): RadarOverlayResult {
  return {
    availability: "unavailable",
    provider: "rainviewer",
    frameTime: null,
    fetchedAt: now.toISOString(),
    stale: false,
    tileUrlTemplate: null,
    frames: [],
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
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (payload.generated > nowSeconds + MAX_CLOCK_SKEW_SECONDS) {
    throw new Error("RainViewer frame is unavailable");
  }

  const validFrames = new Map<number, RadarFrame>();
  for (const frame of payload.radar.past) {
    if (frame.time > nowSeconds + MAX_CLOCK_SKEW_SECONDS) {
      throw new Error("RainViewer frame time is unsafe");
    }
    if (!/^\/v2\/radar\/[A-Za-z0-9_-]{8,64}$/.test(frame.path)) {
      throw new Error("RainViewer frame path is unsafe");
    }
    if (frame.time < nowSeconds - MAX_FRAME_AGE_SECONDS || frame.time > nowSeconds) continue;
    validFrames.set(frame.time, {
      frameTime: new Date(frame.time * 1000).toISOString(),
      tileUrlTemplate: `${host}${frame.path}/256/{z}/{x}/{y}/2/1_0.png`,
      intensityTileUrlTemplate: `${host}${frame.path}/256/{z}/{x}/{y}/2/0_0.png`,
      coverageTileUrlTemplate: `${host}/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png`,
    });
  }
  const frames = [...validFrames.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, frame]) => frame)
    .slice(-MAX_PLAYBACK_FRAMES);
  const latest = frames.at(-1);
  if (!latest) throw new Error("RainViewer frame is unavailable");

  return {
    availability: "radar",
    provider: "rainviewer",
    frameTime: latest.frameTime,
    fetchedAt: now.toISOString(),
    stale: false,
    tileUrlTemplate: latest.tileUrlTemplate,
    frames,
    maxZoom: 7,
    attributionLabel: "RainViewer",
    attributionUrl: "https://www.rainviewer.com/",
  };
}

export function __resetRainViewerCacheForTests() {
  completed = null;
  inFlight?.controller.abort();
  inFlight = null;
}

export function getRainViewerRadar(options?: { fetcher?: typeof fetch; now?: () => Date }): Promise<RadarOverlayResult>;
export function getRainViewerRadar(options: { fetcher?: typeof fetch; now?: () => Date; signal: AbortSignal }): Promise<RadarOverlayResult | null>;
export async function getRainViewerRadar(options?: { fetcher?: typeof fetch; now?: () => Date; signal?: AbortSignal }): Promise<RadarOverlayResult | null> {
  if (options?.signal?.aborted) return null;
  const now = options?.now?.() ?? new Date();
  const nowMs = now.getTime();
  if (completed && completed.freshUntil > nowMs) return completed.value;
  if (inFlight) {
    const pending = inFlight;
    return subscribeToSharedProviderRequest(pending, options?.signal, () => {
      if (inFlight === pending) inFlight = null;
    });
  }

  const cached = completed;
  const request = startSharedProviderRequest(async (signal) => {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), FORECAST_TIMEOUT_MS);
    const requestSignal = AbortSignal.any([signal, timeoutController.signal]);
    try {
      const response = await (options?.fetcher ?? fetch)(RAINVIEWER_METADATA_URL, {
        cache: "no-store",
        redirect: "error",
        signal: requestSignal,
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
    }
  }, (settled) => {
    if (inFlight === settled) inFlight = null;
  });
  inFlight = request;
  return subscribeToSharedProviderRequest(request, options?.signal, () => {
    if (inFlight === request) inFlight = null;
  });
}
