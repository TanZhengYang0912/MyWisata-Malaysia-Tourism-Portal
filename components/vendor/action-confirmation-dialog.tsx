'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';

export interface ActionConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ActionConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = 'primary',
  busy = false,
  onCancel,
  onConfirm,
}: ActionConfirmationDialogProps) {
  const { t } = useTranslation('vendor');
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !busy) onCancel(); }}>
      <DialogContent className="rounded-2xl border-amber-100 p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl text-gray-950">{title}</DialogTitle>
          <DialogDescription className="leading-6 text-gray-600">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>{t('actions.cancel')}</Button>
          <Button type="button" variant={tone === 'danger' ? 'destructive' : 'default'} onClick={onConfirm} disabled={busy}>
            {busy ? t('actions.working') : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
