import { describe, expect, it, vi } from 'vitest';
import {
  analyzeDocumentQuality,
  createDocumentQualityChecker,
  getDocumentQualityPreviewDimensions,
  type DocumentQualityFrame,
  type DocumentQualityResult,
} from '@/lib/kyc/document-quality';

function frame(value: number | ((x: number, y: number) => number), width = 64, height = 48): DocumentQualityFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const pixel = typeof value === 'number' ? value : value(x, y);
      data[offset] = data[offset + 1] = data[offset + 2] = pixel;
      data[offset + 3] = 255;
    }
  }
  return { width, height, data };
}

describe('local advisory document quality', () => {
  it('bounds previews without enlarging or changing the frame aspect', () => {
    expect(getDocumentQualityPreviewDimensions(4032, 3024)).toEqual({ width: 320, height: 240 });
    expect(getDocumentQualityPreviewDimensions(1080, 1920)).toEqual({ width: 180, height: 320 });
    expect(getDocumentQualityPreviewDimensions(64, 48)).toEqual({ width: 64, height: 48 });
    expect(getDocumentQualityPreviewDimensions(0, 0)).toBeNull();
  });

  it('warns about obvious darkness, excessive exposure and low local detail', () => {
    expect(analyzeDocumentQuality(frame(0))).toEqual({ status: 'warn', reasons: ['too_dark', 'low_detail'] });
    expect(analyzeDocumentQuality(frame(255))).toEqual({ status: 'warn', reasons: ['overexposed', 'low_detail'] });
    expect(analyzeDocumentQuality(frame(128))).toEqual({ status: 'warn', reasons: ['low_detail'] });
  });

  it('passes sampled exposure and detail checks without claiming document validity', () => {
    expect(analyzeDocumentQuality(frame((x, y) => (x + y) % 2 ? 80 : 180)))
      .toEqual({ status: 'pass', reasons: [] });
  });

  it('returns unknown for unsupported, malformed or unbounded input', () => {
    expect(analyzeDocumentQuality(null)).toEqual({ status: 'unknown', reasons: ['unsupported'] });
    expect(analyzeDocumentQuality({ width: 64, height: 48, data: new Uint8ClampedArray(3) }))
      .toEqual({ status: 'unknown', reasons: ['invalid_frame'] });
    expect(analyzeDocumentQuality(frame(128, 321, 200))).toEqual({ status: 'unknown', reasons: ['invalid_frame'] });
    const transparent = frame(128);
    transparent.data[3] = 0;
    expect(analyzeDocumentQuality(transparent)).toEqual({ status: 'unknown', reasons: ['invalid_frame'] });
  });

  it('ends work when the local analysis time budget is exhausted', () => {
    let now = 0;
    expect(analyzeDocumentQuality(frame(128), { now: () => now++ * 100 }))
      .toEqual({ status: 'unknown', reasons: ['budget_exceeded'] });
  });

  it('allows one read at a time without queueing repeated checks', async () => {
    let resolveFrame!: (value: DocumentQualityFrame) => void;
    const read = vi.fn(() => new Promise<DocumentQualityFrame>((resolve) => { resolveFrame = resolve; }));
    const checker = createDocumentQualityChecker({ now: () => 1000 });
    const first = checker.check(read);
    expect(await checker.check(read)).toEqual({ status: 'unknown', reasons: ['busy'] });
    expect(read).toHaveBeenCalledOnce();
    resolveFrame(frame(128));
    expect(await first).toEqual({ status: 'warn', reasons: ['low_detail'] });
    expect(await checker.check(read)).toEqual({ status: 'unknown', reasons: ['throttled'] });
    expect(read).toHaveBeenCalledOnce();
  });

  it('discards late reads after disposal and never restarts a disposed checker', async () => {
    let resolveFrame!: (value: DocumentQualityFrame) => void;
    const checker = createDocumentQualityChecker();
    const pending = checker.check(() => new Promise<DocumentQualityFrame>((resolve) => { resolveFrame = resolve; }));
    checker.dispose();
    resolveFrame(frame(128));
    expect(await pending).toEqual({ status: 'unknown', reasons: ['cancelled'] });
    const read = vi.fn(() => frame(128));
    expect(await checker.check(read)).toEqual({ status: 'unknown', reasons: ['cancelled'] });
    expect(read).not.toHaveBeenCalled();
  });

  it('resumes only after the finished-check throttle interval', async () => {
    let now = 1000;
    const checker = createDocumentQualityChecker({ now: () => now });
    const read = vi.fn(() => frame(128));
    await checker.check(read);
    now += 499;
    expect(await checker.check(read)).toEqual({ status: 'unknown', reasons: ['throttled'] });
    now++;
    expect(await checker.check(read)).toEqual({ status: 'warn', reasons: ['low_detail'] });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('maps local frame-read failures to a finite reason without exception details', async () => {
    const checker = createDocumentQualityChecker();
    const result: DocumentQualityResult = await checker.check(() => { throw new Error('private device details'); });
    expect(result).toEqual({ status: 'unknown', reasons: ['unsupported'] });
  });
});
