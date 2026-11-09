import type { KycDocumentType } from './document-policy';

export { classifyCameraError, isCameraOperationCurrent, stopCameraStream } from '@/lib/profile/camera-capture';
export type { CameraErrorCode, CameraFacingMode } from '@/lib/profile/camera-capture';

export type DocumentCaptureRotation = 0 | 90 | 180 | 270;
export type DocumentCaptureRect = { x: number; y: number; width: number; height: number };

export function getDocumentCaptureTemplate(documentType: KycDocumentType) {
  // A positioning guide only; unknown document corners must never trigger a crop.
  return { aspectRatio: documentType === 'passport' ? 125 / 88 : 85.6 / 53.98, safeMargin: 0.08 };
}

export function getDocumentCaptureDimensions(width: number, height: number, rotation: DocumentCaptureRotation = 0) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || width * height > 20_000_000 || ![0, 90, 180, 270].includes(rotation)) {
    throw new Error('capture_failed');
  }
  return rotation === 90 || rotation === 270 ? { width: height, height: width } : { width, height };
}

/** Video frames already reflect browser orientation. Only apply a user-requested rotation. */
export function drawDocumentCapture(context: CanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number, rotation: DocumentCaptureRotation = 0) {
  const output = getDocumentCaptureDimensions(width, height, rotation);
  context.canvas.width = output.width;
  context.canvas.height = output.height;
  context.save();
  try {
    // CSS preview mirroring and devicePixelRatio must not alter captured sensor pixels.
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.translate(output.width / 2, output.height / 2);
    context.rotate(rotation * Math.PI / 180);
    context.drawImage(source, -width / 2, -height / 2, width, height);
  } finally {
    context.restore();
  }
  return output;
}

/** Maps a centered object-fit preview in CSS pixels; this does not crop the capture. */
export function mapDocumentPreviewRectToSource(rect: DocumentCaptureRect, previewWidth: number, previewHeight: number, sourceWidth: number, sourceHeight: number, fit: 'contain' | 'cover', mirrored = false): DocumentCaptureRect {
  getDocumentCaptureDimensions(sourceWidth, sourceHeight);
  if (![previewWidth, previewHeight, rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    || previewWidth <= 0 || previewHeight <= 0 || rect.width < 0 || rect.height < 0) {
    throw new Error('capture_failed');
  }
  const scale = (fit === 'cover' ? Math.max : Math.min)(previewWidth / sourceWidth, previewHeight / sourceHeight);
  const offsetX = (previewWidth - sourceWidth * scale) / 2;
  const offsetY = (previewHeight - sourceHeight * scale) / 2;
  const left = mirrored ? previewWidth - rect.x - rect.width : rect.x;
  const x = Math.max(0, Math.min(sourceWidth, (left - offsetX) / scale));
  const y = Math.max(0, Math.min(sourceHeight, (rect.y - offsetY) / scale));
  const right = Math.max(x, Math.min(sourceWidth, (left + rect.width - offsetX) / scale));
  const bottom = Math.max(y, Math.min(sourceHeight, (rect.y + rect.height - offsetY) / scale));
  return { x, y, width: right - x, height: bottom - y };
}

/** Call only when the preview is accepted; this helper does not upload or retain it. */
export function createCapturedDocumentFile(blob: Blob, now = Date.now()): File {
  if (blob.type !== 'image/jpeg' || blob.size === 0 || blob.size > 5 * 1024 * 1024) throw new Error('capture_failed');
  return new File([blob], `kyc-document-${now}.jpg`, { type: 'image/jpeg', lastModified: now });
}
