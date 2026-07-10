import { clsx } from 'clsx';

type BadgeVariant = 'gray' | 'green' | 'yellow' | 'red' | 'blue' | 'purple';

const COLOURS: Record<BadgeVariant, string> = {
  gray:   'bg-gray-100 text-gray-700',
  green:  'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  red:    'bg-red-100 text-red-700',
  blue:   'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
};

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}

export function Badge({ label, variant = 'gray', className }: BadgeProps) {
  return (
    <span className={clsx('inline-block px-2 py-0.5 rounded text-xs font-medium', COLOURS[variant], className)}>
      {label}
    </span>
  );
}

// Maps domain status strings to badge colour
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    active:          'green',
    approved:        'green',
    completed:       'green',
    confirmed:       'green',
    available:       'green',
    paid:            'blue',
    pending:         'yellow',
    pending_payment: 'yellow',
    pending_approval:'yellow',
    processing:      'yellow',
    open:            'yellow',
    in_progress:     'blue',
    draft:           'gray',
    unverified:      'gray',
    inactive:        'gray',
    archived:        'gray',
    closed:          'gray',
    rejected:        'red',
    cancelled:       'red',
    failed:          'red',
    full:            'red',
    suspended:       'red',
  };
  return <Badge label={status.replace(/_/g, ' ')} variant={map[status] ?? 'gray'} />;
}
