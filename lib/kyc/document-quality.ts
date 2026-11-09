export type DocumentQualityFrame = { width: number; height: number; data: Uint8ClampedArray };
export type DocumentQualityReason = 'too_dark' | 'overexposed' | 'low_detail' | 'unsupported' | 'invalid_frame' | 'budget_exceeded' | 'busy' | 'throttled' | 'cancelled';
export type DocumentQualityResult = { status: 'pass' | 'warn' | 'unknown'; reasons: DocumentQualityReason[] };
const MAX_PREVIEW_SIDE = 320;
const ANALYSIS_BUDGET_MS = 30;
const MIN_CHECK_INTERVAL_MS = 500;

function unknown(reason: DocumentQualityReason): DocumentQualityResult {
  return { status: 'unknown', reasons: [reason] };
}

export function getDocumentQualityPreviewDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) return null;
  const scale = Math.min(1, MAX_PREVIEW_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Heuristic exposure/detail advice only: never an identity, readability or framing gate. */
export function analyzeDocumentQuality(frame: DocumentQualityFrame | null, options: { now?: () => number } = {}): DocumentQualityResult {
  if (!frame) return unknown('unsupported');
  const { width, height, data } = frame;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 3 || height < 3
    || width > MAX_PREVIEW_SIDE || height > MAX_PREVIEW_SIDE
    || !(data instanceof Uint8ClampedArray) || data.length !== width * height * 4) return unknown('invalid_frame');
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const luminance = new Float32Array(width * height);
  let total = 0;
  let overexposed = 0;
  for (let y = 0; y < height; y++) {
    if (now() - startedAt > ANALYSIS_BUDGET_MS) return unknown('budget_exceeded');
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const offset = index * 4;
      if (data[offset + 3] !== 255) return unknown('invalid_frame');
      const value = data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722;
      luminance[index] = value;
      total += value;
      if (value > 245) overexposed++;
    }
  }
  let detail = 0;
  for (let y = 1; y < height - 1; y++) {
    if (now() - startedAt > ANALYSIS_BUDGET_MS) return unknown('budget_exceeded');
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      const laplacian = luminance[index - 1] + luminance[index + 1]
        + luminance[index - width] + luminance[index + width] - 4 * luminance[index];
      detail += laplacian * laplacian;
    }
  }
  const reasons: DocumentQualityReason[] = [];
  // Conservative, uncalibrated hints; real-photo evaluation is required before any gate.
  if (total / (width * height) < 45) reasons.push('too_dark');
  if (overexposed / (width * height) > 0.5) reasons.push('overexposed');
  if (detail / ((width - 2) * (height - 2)) < 40) reasons.push('low_detail');
  return { status: reasons.length ? 'warn' : 'pass', reasons };
}

/** No queue, timer, network, image persistence or continuing work after disposal. */
export function createDocumentQualityChecker(options: { now?: () => number } = {}) {
  const now = options.now ?? (() => performance.now());
  let busy = false;
  let disposed = false;
  let lastFinishedAt = -Infinity;
  return {
    async check(read: () => DocumentQualityFrame | null | Promise<DocumentQualityFrame | null>): Promise<DocumentQualityResult> {
      if (disposed) return unknown('cancelled');
      if (busy) return unknown('busy');
      if (now() - lastFinishedAt < MIN_CHECK_INTERVAL_MS) return unknown('throttled');
      busy = true;
      try {
        const frame = await read();
        if (disposed) return unknown('cancelled');
        return analyzeDocumentQuality(frame, { now });
      } catch {
        return unknown(disposed ? 'cancelled' : 'unsupported');
      } finally {
        busy = false;
        lastFinishedAt = now();
      }
    },
    dispose() { disposed = true; },
  };
}
