'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  closeLabel: string;
  labelledBy?: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  className?: string;
}

export default function CenteredDetailModal({ eyebrow, title, subtitle, closeLabel, labelledBy, onClose, children, size = 'md', className }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previousActiveElement = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    dialog?.focus();
    document.body.style.overflow = 'hidden';

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (document.activeElement === dialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      previousActiveElement?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-gray-950/30 p-4 backdrop-blur-[1px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        className={`max-h-[90vh] w-full overscroll-contain overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl outline-none ${size === 'xl' ? 'max-w-5xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg'} ${className || ''}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{eyebrow}</p>}
            <h2 id={titleId} className="mt-1 text-balance text-xl font-bold text-gray-950">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={closeLabel} title={closeLabel} className="shrink-0 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X size={18} aria-hidden="true" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
