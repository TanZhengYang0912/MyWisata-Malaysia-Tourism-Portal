'use client';

import { useRef, useState } from 'react';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { FileUp, LoaderCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ImageShapeHint, useImageCrop } from '@/components/shared/image-crop-dialog';
import type { ImageShape } from '@/lib/media/image-aspect';

interface UploadedMedia {
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  kind: string;
}

interface Props {
  vendorId: string;
  productId?: string;
  kind?: 'image' | 'digital';
  /** Recommended shape for images; a photo of another shape is cropped before upload. */
  shape?: ImageShape;
  value?: string | null;
  successMessage?: string;
  onUploaded: (media: UploadedMedia) => void;
  onError?: (message: string) => void;
}

export default function ProductMediaUploader({ vendorId, productId, kind = 'image', shape, value, successMessage, onUploaded, onError }: Props) {
  const { t } = useTranslation('vendor');
  const { showFeedback } = useActionFeedback();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { cropToShape, cropDialog } = useImageCrop();

  async function upload(selected: File) {
    const file = kind === 'image' && shape ? await cropToShape(selected, shape) : selected;
    if (!file) {
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setUploading(true);
    onError?.('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('kind', kind);
      if (productId) formData.append('productId', productId);
      const response = await fetch('/api/vendors/' + vendorId + '/media/upload', { method: 'POST', body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t('media.uploadFailed'));
      onUploaded(payload.data);
      showFeedback('success', successMessage || (kind === 'image' ? t('media.productImageUploaded') : t('media.digitalAssetUploaded')));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('media.uploadFailed');
      onError?.(message);
      showFeedback('error', message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div
      className="space-y-2 rounded-xl border border-dashed border-transparent p-1 transition hover:border-primary/20"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file && !uploading) void upload(file);
      }}
      aria-label={t('media.dropFile')}
    >
      <div className="flex items-center gap-3">
        {value ? (
          kind === 'image'
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={value} alt={t('media.uploadedPreview')} className="h-16 w-24 rounded-lg border border-gray-200 dark:border-border object-cover" />
            : <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/50 text-xs font-semibold text-gray-500 dark:text-muted-foreground">{t('media.fileReady')}</div>
        ) : <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed border-gray-300 dark:border-border bg-gray-50 dark:bg-muted/50 text-gray-400 dark:text-muted-foreground"><FileUp size={20} /></div>}
        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            type="file"
            accept={kind === 'digital' ? '.pdf,.zip,application/pdf,application/zip' : 'image/jpeg,image/png,image/webp'}
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }}
            className="sr-only"
          />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-border bg-card px-3 py-2 text-xs font-semibold text-gray-700 dark:text-foreground hover:border-primary/30 hover:text-primary disabled:opacity-50">
            {uploading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {value ? t('media.replaceFile') : t('media.uploadFile')}
          </button>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-muted-foreground">{kind === 'digital' ? t('media.digitalFormats') : t('media.imageFormats')}</p>
          {kind === 'image' && shape && <ImageShapeHint shape={shape} className="mt-1 text-[11px] text-gray-500 dark:text-muted-foreground" />}
          <p className="mt-1 text-[10px] font-semibold text-primary/60">{t('media.dragFileHint')}</p>
        </div>
      </div>
      {cropDialog}
    </div>
  );
}
