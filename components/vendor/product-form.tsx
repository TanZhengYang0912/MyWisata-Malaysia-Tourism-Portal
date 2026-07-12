'use client';
// P2 — Member 2: Product creation/edit form (B2)

import { useState, useEffect } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { productCreateSchema, productUpdateSchema, type ProductCreate } from '@/lib/validation/vendor-schemas';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { Sparkles } from 'lucide-react';

interface Props {
  vendorId: string;
  initialData?: ProductCreate & { id?: string };
  onSuccess?: () => void;
  onClose?: () => void;
}

export default function ProductForm({ vendorId, initialData, onSuccess, onClose }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [outlets, setOutlets] = useState<{ id: string; name: string; city?: string | null; state?: string | null }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionMessage, setSuggestionMessage] = useState<string | null>(null);
  const supabase = createClient();
  const validationSchema = initialData?.id ? productUpdateSchema : productCreateSchema;

  const { register, handleSubmit, getValues, setValue, formState: { errors, isSubmitting } } = useForm<any>({
    resolver: zodResolver(validationSchema) as any,
    shouldFocusError: true,
    defaultValues: initialData
      ? { ...initialData, tags: Array.isArray(initialData.tags) ? initialData.tags.join(', ') : '' }
      : { requiresBooking: false, productType: 'product', tags: '' },
  });

  useEffect(() => {
    Promise.all([
      supabase.from('outlets').select('id, name, city, state').eq('vendor_id', vendorId),
      supabase.from('categories').select('id, name').eq('is_active', true).order('sort_order'),
    ]).then(([outletResult, categoryResult]) => {
      setOutlets(outletResult.data ?? []);
      setCategories(categoryResult.data ?? []);
      if (initialData?.outletId) {
        setValue('outletId', initialData.outletId, { shouldDirty: false, shouldTouch: false });
      }
      if (initialData?.categoryId) {
        setValue('categoryId', initialData.categoryId, { shouldDirty: false, shouldTouch: false });
      }
    });
  }, [vendorId, supabase, initialData?.outletId, initialData?.categoryId, setValue]);

  async function suggestListing() {
    const values = getValues();
    const outlet = outlets.find((item) => item.id === values.outletId);
    setSuggesting(true);
    setSuggestionMessage(null);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/products/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          productType: values.productType,
          location: [outlet?.city, outlet?.state].filter(Boolean).join(', '),
          description: values.description,
          keywords: String(values.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean),
          priceRange: values.basePrice ? `RM ${values.basePrice}` : undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'AI suggestions are not available yet.');
      const suggestion = payload.data?.suggestion;
      if (!suggestion) throw new Error('AI did not return a usable suggestion.');
      setValue('name', suggestion.title, { shouldDirty: true });
      setValue('description', suggestion.description, { shouldDirty: true });
      setValue('tags', suggestion.tags.join(', '), { shouldDirty: true });
      const matchedCategory = categories.find((category) => category.name.toLowerCase() === String(suggestion.category).toLowerCase());
      if (matchedCategory) {
        setValue('categoryId', matchedCategory.id, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      }
      setSuggestionMessage('Draft suggestion applied. Please review it before saving.');
    } catch (error) {
      setSuggestionMessage(error instanceof Error ? error.message : 'AI suggestions are deferred.');
    } finally {
      setSuggesting(false);
    }
  }

  function onInvalid(formErrors: FieldErrors) {
    const firstError = Object.values(formErrors)[0] as { message?: string } | undefined;
    setServerError(firstError?.message || 'Please check the highlighted fields before saving.');
  }

  async function onSubmit(data: any) {
    setServerError(null);
    const normalizedData = {
      name: String(data.name || '').trim(),
      description: data.description ? String(data.description).trim() : undefined,
      productType: data.productType,
      requiresBooking: Boolean(data.requiresBooking),
      basePrice: Number(data.basePrice),
      categoryId: data.categoryId || undefined,
      coverUrl: data.coverUrl || undefined,
      tags: typeof data.tags === 'string'
        ? data.tags.split(',').map((tag: string) => tag.trim()).filter(Boolean)
        : Array.isArray(data.tags) ? data.tags : undefined,
      ...(initialData?.id ? {} : { outletId: data.outletId }),
    };
    try {
      const isEdit = !!initialData?.id;
      const url = isEdit 
        ? `/api/vendors/${vendorId}/products/${initialData.id}` 
        : `/api/vendors/${vendorId}/products`;
        
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedData),
      });
      
      const result = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = result?.error?.details?.fieldErrors;
        const fieldMessage = detail && Object.values(detail).flat().find(Boolean);
        setServerError(String(fieldMessage || result?.error?.message || 'Failed to save product'));
        return;
      }
      onSuccess?.();
    } catch (error) {
      console.error('Product save failed', error);
      setServerError('Network error. Please try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">{initialData?.id ? 'Edit Product' : 'Add Product'}</h2>
        {onClose && <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>}
      </div>

      {serverError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {serverError}
        </div>
      )}

      <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-violet-950">AI listing assistant</p>
            <p className="mt-0.5 text-xs text-violet-700">Optional draft help. You remain responsible for checking every detail.</p>
          </div>
          <button type="button" onClick={suggestListing} disabled={suggesting} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
            <Sparkles size={14} /> {suggesting ? 'Drafting…' : 'Suggest'}
          </button>
        </div>
        {suggestionMessage && <p className="mt-2 text-xs text-violet-800">{suggestionMessage}</p>}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <Input {...register('name')} placeholder="e.g. Guided City Tour" />
          {errors.name && <p className="text-red-500 text-xs mt-1">{(errors.name as any)?.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            {...register('description')}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Product details..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
            <select {...register('productType')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="product">Physical Product</option>
              <option value="activity">Activity</option>
              <option value="experience">Experience</option>
              <option value="food">Food & Beverage</option>
              <option value="digital">Digital</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Base Price (RM) *</label>
            <Input {...register('basePrice', { valueAsNumber: true })} type="number" step="0.01" />
            {errors.basePrice && <p className="text-red-500 text-xs mt-1">{(errors.basePrice as any)?.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select {...register('categoryId')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Select category...</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            {errors.categoryId && <p className="text-red-500 text-xs mt-1">{(errors.categoryId as any)?.message || 'Please choose a valid category.'}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
          <Input {...register('tags')} placeholder="food, heritage, family-friendly" />
          <p className="mt-1 text-xs text-gray-400">Separate tags with commas.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Outlet *</label>
            <select {...register('outletId')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Select outlet...</option>
              {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            {errors.outletId && <p className="text-red-500 text-xs mt-1">{(errors.outletId as any)?.message}</p>}
          </div>
          <div className="flex items-center pt-6">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input type="checkbox" {...register('requiresBooking')} className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
              Requires Booking (Timeslots)
            </label>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Product'}
        </Button>
      </div>
    </form>
  );
}
