'use client';

import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type OutletAction = {
  id: string;
  label: string;
  onSelect: () => void;
  variant: 'primary' | 'secondary' | 'tertiary' | 'destructive';
  icon?: LucideIcon;
  ariaLabel?: string;
};

interface Props {
  actions: OutletAction[];
  ariaLabel: string;
  layout?: 'card' | 'detail';
}

const variantClasses: Record<OutletAction['variant'], string> = {
  primary: 'bg-primary text-white hover:bg-primary/90',
  secondary: 'border-primary/20 bg-secondary text-primary hover:bg-secondary/80',
  tertiary: 'text-primary hover:bg-secondary',
  destructive: 'border-red-200 dark:border-red-500/30 bg-card text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10',
};

export default function OutletActionGroup({ actions, ariaLabel, layout = 'card' }: Props) {
  if (!actions.length) return null;

  return (
    <div role="group" aria-label={ariaLabel} className={layout === 'detail' ? 'grid grid-cols-1 gap-2 sm:grid-cols-2' : 'grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end sm:gap-1'}>
      {actions.map(({ id, label, onSelect, variant, icon: Icon, ariaLabel: actionAriaLabel }) => (
        <Button
          key={id}
          type="button"
          variant={variant === 'primary' ? 'default' : variant === 'tertiary' ? 'ghost' : 'outline'}
          onClick={onSelect}
          aria-label={actionAriaLabel}
          data-outlet-action={id}
          className={`${layout === 'detail' ? 'min-h-11 w-full rounded-xl px-4 py-2.5 text-sm' : 'min-h-11 w-full rounded-lg px-3 py-2.5 text-sm sm:min-h-10 sm:w-auto sm:px-2.5 sm:py-2 sm:text-xs'} ${layout === 'detail' && variant === 'destructive' ? 'sm:col-span-2' : ''} font-semibold ${variantClasses[variant]}`}
        >
          {Icon && <Icon size={layout === 'detail' ? 15 : 16} aria-hidden="true" />}
          {label}
        </Button>
      ))}
    </div>
  );
}
