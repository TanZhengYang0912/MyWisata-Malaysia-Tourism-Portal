'use client';
// P2 — Member 2: Vendor registration form (B1)

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { vendorRegisterSchema, type VendorRegister } from '@/lib/validation/vendor-schemas';

interface Props {
  onClose?: () => void;
}

export default function RegisterVendorForm({ onClose }: Props) {
  const { showFeedback } = useActionFeedback();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VendorRegister>({
    resolver: zodResolver(vendorRegisterSchema),
  });

  async function onSubmit(data: VendorRegister) {
    setServerError(null);
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();

      if (!res.ok) {
        setServerError(result.error?.message ?? 'Failed to register');
        showFeedback('error', result.error?.message ?? 'Failed to register');
        return;
      }

      showFeedback('success', 'Vendor application submitted for admin review.');
      router.refresh();
      onClose?.();
    } catch {
      setServerError('Network error — please try again');
      showFeedback('error', 'Vendor registration failed. Please try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <h2 className="text-lg font-semibold">Register as Vendor</h2>
      <p className="text-sm text-muted-foreground">Submit the basic business profile first. After approval, you can add the outlet, products, photos and time slots from the vendor dashboard.</p>

      {serverError && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      {/* Name */}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Business Name *</label>
        <input
          {...register('name')}
          placeholder="e.g. Rasa Malaysia Kitchen"
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Description</label>
        <textarea
          {...register('description')}
          rows={3}
          placeholder="Describe your business..."
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {errors.description && <p className="mt-1 text-xs text-destructive">{errors.description.message}</p>}
      </div>

      {/* Business Type */}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Business Type</label>
        <select
          {...register('businessType')}
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="">Select type...</option>
          <option value="restaurant">Restaurant / Food & Beverage</option>
          <option value="tour_operator">Tour Operator</option>
          <option value="accommodation">Accommodation</option>
          <option value="retail">Retail / Shopping</option>
          <option value="wellness">Wellness & Spa</option>
          <option value="adventure">Adventure & Sports</option>
          <option value="other">Other</option>
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="mb-1 block text-sm font-medium text-foreground">Legal Business Name</label><input {...register('legalBusinessName')} placeholder="Registered business name" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />{errors.legalBusinessName && <p className="mt-1 text-xs text-destructive">{errors.legalBusinessName.message}</p>}</div>
        <div><label className="mb-1 block text-sm font-medium text-foreground">Registration Number</label><input {...register('registrationNumber')} placeholder="Optional for sole proprietors" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />{errors.registrationNumber && <p className="mt-1 text-xs text-destructive">{errors.registrationNumber.message}</p>}</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="mb-1 block text-sm font-medium text-foreground">Contact Person</label><input {...register('contactName')} placeholder="Owner or authorised person" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>
        <div><label className="mb-1 block text-sm font-medium text-foreground">Contact Phone</label><input {...register('contactPhone')} placeholder="+60..." className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>
      </div>

      <div><label className="mb-1 block text-sm font-medium text-foreground">Business Email</label><input {...register('contactEmail')} type="email" placeholder="business@example.com" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />{errors.contactEmail && <p className="mt-1 text-xs text-destructive">{errors.contactEmail.message}</p>}</div>
      <div><label className="mb-1 block text-sm font-medium text-foreground">Business Address</label><textarea {...register('businessAddress')} rows={2} placeholder="Registered business address" className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>

      {/* Logo URL */}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Logo URL</label>
        <input
          {...register('logoUrl')}
          placeholder="https://..."
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {errors.logoUrl && <p className="mt-1 text-xs text-destructive">{errors.logoUrl.message}</p>}
      </div>

      {/* Cover URL */}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Cover Image URL</label>
        <input
          {...register('coverUrl')}
          placeholder="https://..."
          className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {errors.coverUrl && <p className="mt-1 text-xs text-destructive">{errors.coverUrl.message}</p>}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Application'}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
