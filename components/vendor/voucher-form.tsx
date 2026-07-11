'use client';
// P2 — Member 2: Voucher creation form (B3)

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { voucherCreateSchema, type VoucherCreate } from '@/lib/validation/vendor-schemas';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

interface Props {
  vendorId: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

export default function VoucherForm({ vendorId, onSuccess, onClose }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const supabase = createClient();

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<any>({
    resolver: zodResolver(voucherCreateSchema) as any,
    defaultValues: { voucherType: 'fixed', minSpend: 0 },
  });

  useEffect(() => {
    supabase.from('outlets').select('id, name').eq('vendor_id', vendorId)
      .then(({ data }) => setOutlets(data ?? []));
  }, [vendorId, supabase]);

  function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  async function onSubmit(data: any) {
    setServerError(null);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/vouchers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      const result = await res.json();
      if (!res.ok) {
        setServerError(result.error?.message ?? 'Failed to save voucher');
        return;
      }
      onSuccess?.();
    } catch {
      setServerError('Network error. Please try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Create Voucher</h2>
        {onClose && <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>}
      </div>

      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {serverError}
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
            <div className="flex gap-2">
              <Input {...register('code')} className="uppercase" placeholder="e.g. SUMMER24" />
              <Button type="button" variant="outline" onClick={() => {
                const el = document.querySelector('input[name="code"]') as HTMLInputElement;
                if (el) {
                  const code = generateCode();
                  el.value = code;
                  // Trigger change event for react-hook-form
                  const event = new Event('input', { bubbles: true });
                  el.dispatchEvent(event);
                }
              }}>Auto</Button>
            </div>
            {errors.code && <p className="text-red-500 text-xs mt-1">{(errors.code as any)?.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <Input {...register('name')} placeholder="e.g. Summer Special" />
            {errors.name && <p className="text-red-500 text-xs mt-1">{(errors.name as any)?.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
            <select {...register('voucherType')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="fixed">Fixed Amount (RM)</option>
              <option value="percent">Percentage (%)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Discount Value *</label>
            <Input {...register('discountValue', { valueAsNumber: true })} type="number" step="0.01" />
            {errors.discountValue && <p className="text-red-500 text-xs mt-1">{(errors.discountValue as any)?.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Spend (RM)</label>
            <Input {...register('minSpend', { valueAsNumber: true })} type="number" step="0.01" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Uses</label>
            <Input {...register('maxUses', { valueAsNumber: true })} type="number" placeholder="Unlimited" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valid From</label>
            <Input {...register('validFrom')} type="datetime-local" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valid Until</label>
            <Input {...register('validUntil')} type="datetime-local" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Specific Outlet (Optional)</label>
          <select {...register('outletId')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">All Outlets</option>
            {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Create Voucher'}
        </Button>
      </div>
    </form>
  );
}
