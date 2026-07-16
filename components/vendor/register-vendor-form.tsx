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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <h2 className="text-lg font-semibold">Register as Vendor</h2>
      <p className="text-sm text-gray-500">Submit the basic business profile first. After approval, you can add the outlet, products, photos and time slots from the vendor dashboard.</p>

      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {serverError}
        </div>
      )}

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Business Name *</label>
        <input
          {...register('name')}
          placeholder="e.g. Rasa Malaysia Kitchen"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-transparent"
        />
        {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          {...register('description')}
          rows={3}
          placeholder="Describe your business..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-transparent resize-none"
        />
        {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description.message}</p>}
      </div>

      {/* Business Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Business Type</label>
        <select
          {...register('businessType')}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-transparent"
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
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Legal Business Name</label><input {...register('legalBusinessName')} placeholder="Registered business name" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />{errors.legalBusinessName && <p className="text-red-500 text-xs mt-1">{errors.legalBusinessName.message}</p>}</div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label><input {...register('registrationNumber')} placeholder="Optional for sole proprietors" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />{errors.registrationNumber && <p className="text-red-500 text-xs mt-1">{errors.registrationNumber.message}</p>}</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label><input {...register('contactName')} placeholder="Owner or authorised person" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label><input {...register('contactPhone')} placeholder="+60..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" /></div>
      </div>

      <div><label className="block text-sm font-medium text-gray-700 mb-1">Business Email</label><input {...register('contactEmail')} type="email" placeholder="business@example.com" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />{errors.contactEmail && <p className="text-red-500 text-xs mt-1">{errors.contactEmail.message}</p>}</div>
      <div><label className="block text-sm font-medium text-gray-700 mb-1">Business Address</label><textarea {...register('businessAddress')} rows={2} placeholder="Registered business address" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" /></div>

      {/* Logo URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
        <input
          {...register('logoUrl')}
          placeholder="https://..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-transparent"
        />
        {errors.logoUrl && <p className="text-red-500 text-xs mt-1">{errors.logoUrl.message}</p>}
      </div>

      {/* Cover URL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Cover Image URL</label>
        <input
          {...register('coverUrl')}
          placeholder="https://..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-transparent"
        />
        {errors.coverUrl && <p className="text-red-500 text-xs mt-1">{errors.coverUrl.message}</p>}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 bg-primary text-white py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Application'}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
