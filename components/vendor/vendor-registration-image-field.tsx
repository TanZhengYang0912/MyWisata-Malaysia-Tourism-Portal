'use client';

import { useEffect, useMemo, useRef } from 'react';
import { FileUp, Image as ImageIcon, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { validateAvatarFileMetadata } from '@/lib/profile/avatar-validation';

interface Props {
  id: string;
  label: string;
  file: File | null;
  disabled?: boolean;
  error?: string | null;
  onFileChange: (file: File | null) => void;
  onError: (message: string | null) => void;
}

export default function VendorRegistrationImageField({
  id,
  label,
  file,
  disabled = false,
  error,
  onFileChange,
  onError,
}: Props) {
  const { t } = useTranslation('vendor');
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function selectFile(nextFile: File | null) {
    if (!nextFile) return;
    const validation = validateAvatarFileMetadata(nextFile);
    if (!validation.ok) {
      onError(t(validation.reason === 'type' ? 'registration.images.invalidType' : 'registration.images.tooLarge'));
      return;
    }
    onError(null);
    onFileChange(nextFile);
  }

  return (
    <div
      role="group"
      aria-label={label}
      aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
      className={`rounded-xl border border-dashed p-3 transition-colors ${error ? 'border-destructive/50 bg-destructive/[0.03]' : 'border-border bg-background hover:border-primary/30'}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        selectFile(event.dataTransfer.files?.[0] ?? null);
      }}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          selectFile(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />

      {file && previewUrl ? (
        <div className="flex items-center gap-3">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={t('registration.images.previewAlt', { label })} className="h-full w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{file.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('registration.images.selected')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={disabled}>
                <RefreshCw aria-hidden="true" /> {t('registration.images.replace')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { onFileChange(null); onError(null); }}
                disabled={disabled}
                aria-label={t('registration.images.removeLabel', { label })}
              >
                <Trash2 aria-hidden="true" /> {t('registration.images.remove')}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-24 items-center gap-3">
          <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
            <ImageIcon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{t('registration.images.emptyTitle')}</p>
            <p id={`${id}-help`} className="mt-1 text-xs leading-5 text-muted-foreground">
              {t('registration.images.formats')}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={disabled}>
            <FileUp aria-hidden="true" /> {t('registration.images.choose')}
          </Button>
        </div>
      )}

      {file && <p id={`${id}-help`} className="mt-2 text-xs leading-5 text-muted-foreground">{t('registration.images.formats')}</p>}
      {error && <p id={`${id}-error`} role="alert" className="mt-2 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
