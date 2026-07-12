import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/components/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };

const COLOURS: Record<string, string> = {
  active:          'bg-green-100 text-green-700 border-transparent dark:bg-green-900/30 dark:text-green-400',
  approved:        'bg-green-100 text-green-700 border-transparent dark:bg-green-900/30 dark:text-green-400',
  completed:       'bg-green-100 text-green-700 border-transparent dark:bg-green-900/30 dark:text-green-400',
  confirmed:       'bg-green-100 text-green-700 border-transparent dark:bg-green-900/30 dark:text-green-400',
  available:       'bg-green-100 text-green-700 border-transparent dark:bg-green-900/30 dark:text-green-400',
  paid:            'bg-blue-100 text-blue-700 border-transparent dark:bg-blue-900/30 dark:text-blue-400',
  pending:         'bg-yellow-100 text-yellow-700 border-transparent dark:bg-yellow-900/30 dark:text-yellow-400',
  pending_payment: 'bg-yellow-100 text-yellow-700 border-transparent dark:bg-yellow-900/30 dark:text-yellow-400',
  pending_approval:'bg-yellow-100 text-yellow-700 border-transparent dark:bg-yellow-900/30 dark:text-yellow-400',
  pending_review:  'bg-yellow-100 text-yellow-700 border-transparent dark:bg-yellow-900/30 dark:text-yellow-400',
  processing:      'bg-yellow-100 text-yellow-700 border-transparent dark:bg-yellow-900/30 dark:text-yellow-400',
  open:            'bg-yellow-100 text-yellow-700 border-transparent dark:bg-yellow-900/30 dark:text-yellow-400',
  in_progress:     'bg-blue-100 text-blue-700 border-transparent dark:bg-blue-900/30 dark:text-blue-400',
  draft:           'bg-gray-100 text-gray-700 border-transparent dark:bg-gray-800 dark:text-gray-400',
  unverified:      'bg-gray-100 text-gray-700 border-transparent dark:bg-gray-800 dark:text-gray-400',
  inactive:        'bg-gray-100 text-gray-700 border-transparent dark:bg-gray-800 dark:text-gray-400',
  archived:        'bg-gray-100 text-gray-700 border-transparent dark:bg-gray-800 dark:text-gray-400',
  closed:          'bg-gray-100 text-gray-700 border-transparent dark:bg-gray-800 dark:text-gray-400',
  rejected:        'bg-red-100 text-red-700 border-transparent dark:bg-red-900/30 dark:text-red-400',
  change_requested:'bg-orange-100 text-orange-700 border-transparent dark:bg-orange-900/30 dark:text-orange-400',
  cancelled:       'bg-red-100 text-red-700 border-transparent dark:bg-red-900/30 dark:text-red-400',
  failed:          'bg-red-100 text-red-700 border-transparent dark:bg-red-900/30 dark:text-red-400',
  full:            'bg-red-100 text-red-700 border-transparent dark:bg-red-900/30 dark:text-red-400',
  suspended:       'bg-red-100 text-red-700 border-transparent dark:bg-red-900/30 dark:text-red-400',
};

export function StatusBadge({ status }: { status: string }) {
  const label = status.replace(/_/g, ' ');
  const colorClass = COLOURS[status] ?? 'bg-gray-100 text-gray-700 border-transparent dark:bg-gray-800 dark:text-gray-400';
  return <Badge className={colorClass}>{label}</Badge>;
}
