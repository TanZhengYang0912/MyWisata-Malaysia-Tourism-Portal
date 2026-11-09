/**
 * Recommended upload shapes. Customer pages frame photos with `object-cover`, so a photo of
 * another shape is trimmed automatically; cropping at upload lets the uploader choose what
 * stays in frame. See Docs/plans/2026-10-24-0134-image-aspect-crop.md.
 */
export type ImageShape = 'photo' | 'square' | 'cover' | 'banner';

export const IMAGE_SHAPES: Record<ImageShape, { ratio: number; label: string; example: string }> = {
  photo: { ratio: 4 / 3, label: '4:3', example: '1600×1200' },
  square: { ratio: 1, label: '1:1', example: '800×800' },
  cover: { ratio: 3 / 2, label: '3:2', example: '1800×1200' },
  banner: { ratio: 16 / 9, label: '16:9', example: '1920×1080' },
};

// Phone cameras and exports are rarely exact; within 2% no visible trimming happens.
const SHAPE_TOLERANCE = 0.02;
const MAX_LONG_SIDE = 2000;

export function needsCrop(width: number, height: number, shape: ImageShape): boolean {
  if (!(width > 0 && height > 0)) return false;
  const ratio = IMAGE_SHAPES[shape].ratio;
  return Math.abs(width / height - ratio) / ratio > SHAPE_TOLERANCE;
}

/** Output pixel size for a cropped area, scaled down so the long side is at most 2000 px. */
export function croppedOutputSize(area: { width: number; height: number }): { width: number; height: number } {
  const scale = Math.min(1, MAX_LONG_SIDE / Math.max(area.width, area.height));
  return { width: Math.max(1, Math.round(area.width * scale)), height: Math.max(1, Math.round(area.height * scale)) };
}

/** Keeps PNG and WebP (transparency, size); everything else becomes JPEG. */
export function croppedOutputType(type: string): 'image/png' | 'image/webp' | 'image/jpeg' {
  return type === 'image/png' || type === 'image/webp' ? type : 'image/jpeg';
}

export function croppedFileName(name: string, type: ReturnType<typeof croppedOutputType>): string {
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const base = name.replace(/\.[^./\\]+$/, '') || 'photo';
  return `${base}.${extension}`;
}

export type ImageCropArea = { x: number; y: number; width: number; height: number };

export function isValidNonOverlappingCropPair(first: ImageCropArea, second: ImageCropArea, imageWidth: number, imageHeight: number): boolean {
  const validArea = (area: ImageCropArea) => [area.x, area.y, area.width, area.height].every(Number.isFinite)
    && area.x >= 0 && area.y >= 0 && area.width > 0 && area.height > 0
    && area.x + area.width <= imageWidth && area.y + area.height <= imageHeight;
  if (!(imageWidth > 0 && imageHeight > 0) || !validArea(first) || !validArea(second)) return false;
  const overlapWidth = Math.max(0, Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x));
  const overlapHeight = Math.max(0, Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y));
  return overlapWidth === 0 || overlapHeight === 0;
}
