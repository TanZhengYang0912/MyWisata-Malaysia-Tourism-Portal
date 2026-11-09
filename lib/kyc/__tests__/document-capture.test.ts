import { describe, expect, it, vi } from 'vitest';
import {
  createCapturedDocumentFile,
  drawDocumentCapture,
  getDocumentCaptureDimensions,
  getDocumentCaptureTemplate,
  mapDocumentPreviewRectToSource,
} from '@/lib/kyc/document-capture';

describe('document capture', () => {
  it('uses rectangular card and passport guides with a safe margin', () => {
    expect(getDocumentCaptureTemplate('national_id')).toEqual({ aspectRatio: 85.6 / 53.98, safeMargin: 0.08 });
    expect(getDocumentCaptureTemplate('driving_license')).toEqual(getDocumentCaptureTemplate('national_id'));
    expect(getDocumentCaptureTemplate('passport')).toEqual({ aspectRatio: 125 / 88, safeMargin: 0.08 });
  });

  it('retains the entire native frame instead of cropping or downscaling', () => {
    expect(getDocumentCaptureDimensions(4032, 3024)).toEqual({ width: 4032, height: 3024 });
    expect(getDocumentCaptureDimensions(1080, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(getDocumentCaptureDimensions(4032, 3024, 90)).toEqual({ width: 3024, height: 4032 });
    expect(getDocumentCaptureDimensions(4032, 3024, 270)).toEqual({ width: 3024, height: 4032 });
    expect(getDocumentCaptureDimensions(4032, 3024, 180)).toEqual({ width: 4032, height: 3024 });
  });

  it('rejects invalid or excessive canvas allocations', () => {
    for (const dimensions of [[0, 10], [NaN, 10], [-1, 10], [1.5, 10], [10_000, 10_000]]) {
      expect(() => getDocumentCaptureDimensions(dimensions[0], dimensions[1])).toThrow('capture_failed');
    }
    expect(() => getDocumentCaptureDimensions(1920, 1080, 45 as 90)).toThrow('capture_failed');
  });

  it('draws every source pixel with explicit rotation and no mirror transform', () => {
    const context = {
      canvas: { width: 0, height: 0 },
      save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(),
      translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn(),
    };
    const source = {} as CanvasImageSource;
    drawDocumentCapture(context as unknown as CanvasRenderingContext2D, source, 1920, 1080, 90);
    expect(context.canvas).toEqual({ width: 1080, height: 1920 });
    expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(context.translate).toHaveBeenCalledWith(540, 960);
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(context.drawImage).toHaveBeenCalledWith(source, -960, -540, 1920, 1080);
    expect(context.restore).toHaveBeenCalledOnce();
  });

  it('maps CSS preview coordinates using sensor pixels, fit and preview mirroring', () => {
    expect(mapDocumentPreviewRectToSource({ x: 0, y: 50, width: 400, height: 200 }, 400, 300, 2000, 1000, 'contain'))
      .toEqual({ x: 0, y: 0, width: 2000, height: 1000 });
    const covered = mapDocumentPreviewRectToSource({ x: 0, y: 0, width: 100, height: 300 }, 400, 300, 2000, 1000, 'cover');
    expect(covered.x).toBeCloseTo(1000 / 3);
    expect(covered.width).toBeCloseTo(1000 / 3);
    expect(covered.height).toBe(1000);
    const mirrored = mapDocumentPreviewRectToSource({ x: 0, y: 0, width: 100, height: 300 }, 400, 300, 2000, 1000, 'cover', true);
    expect(mirrored.x).toBeCloseTo(4000 / 3);
    expect(mirrored.width).toBeCloseTo(1000 / 3);
    expect(mirrored.height).toBe(1000);
  });

  it('creates a document File only when the caller accepts the captured blob', () => {
    const file = createCapturedDocumentFile(new Blob(['jpeg'], { type: 'image/jpeg' }), 1234);
    expect(file.name).toBe('kyc-document-1234.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(file.lastModified).toBe(1234);
  });

  it('rejects empty, oversized or mislabeled captured blobs', () => {
    expect(() => createCapturedDocumentFile(new Blob([], { type: 'image/jpeg' }))).toThrow('capture_failed');
    expect(() => createCapturedDocumentFile(new Blob(['png'], { type: 'image/png' }))).toThrow('capture_failed');
    expect(() => createCapturedDocumentFile(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/jpeg' }))).toThrow('capture_failed');
  });

  it('clips guide coordinates to sensor bounds and rejects invalid preview dimensions', () => {
    expect(mapDocumentPreviewRectToSource({ x: -50, y: -50, width: 300, height: 200 }, 200, 100, 2000, 1000, 'contain'))
      .toEqual({ x: 0, y: 0, width: 2000, height: 1000 });
    expect(() => mapDocumentPreviewRectToSource({ x: 0, y: 0, width: 20, height: 10 }, 0, 100, 2000, 1000, 'contain')).toThrow('capture_failed');
  });
});
