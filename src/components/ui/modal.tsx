'use client';
// Lightweight headless modal — no external dependency.
// Uses portal + backdrop + focus trap on native <dialog>-like behaviour via
// keyboard + click handlers. Accessible role="dialog" + aria-modal.
//
// Usage:
//   <Modal open={isOpen} onClose={() => setOpen(false)} title="Confirm">
//     ...body...
//   </Modal>

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { clsx } from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Prevent closing via backdrop/Escape (e.g., during in-flight submit) */
  dismissable?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
} as const;

export function Modal({
  open, onClose, title, children,
  dismissable = true, size = 'md',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape key + focus trap
  useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && dismissable) onClose();
    }
    document.addEventListener('keydown', handleKey);
    // Block scroll while modal is open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = originalOverflow;
      previousActive?.focus?.();
    };
  }, [open, onClose, dismissable]);

  if (!open || typeof window === 'undefined') return null;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={() => dismissable && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden="true" />

      {/* Panel */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={clsx(
          'relative w-full bg-white rounded-2xl shadow-xl',
          'animate-in fade-in zoom-in-95 duration-150',
          SIZES[size],
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <h2 id="modal-title" className="text-base font-semibold text-gray-900">{title}</h2>
            {dismissable && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-1 -m-1 text-gray-400 hover:text-gray-700 transition-colors rounded"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
