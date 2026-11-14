'use client';
// P2 — Member 2: Product creation/edit form (B2)

import { useState, useEffect } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { productCreateSchema, productUpdateSchema, type ProductCreate } from '@/lib/validation/vendor-schemas';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { Check, ImagePlus, Trash2 } from 'lucide-react';
import { buildProductFormDefaults, normalizeProductTags, validateProductReviewReadiness } from '@/lib/vendor/product-form-helpers';
import ProductMediaUploader from '@/components/vendor/product-media-uploader';
import { useActionFeedback } from '@/components/providers/action-feedback';
import AiWritingAssistant from '@/components/vendor/ai-writing-assistant';
import type { ListingSuggestion } from '@/lib/ai/listing-suggestions';
import { canonicalCategorySlug, normalizeCategoryRows, type CanonicalCategoryOption } from '@/lib/customer/discovery-categories';
import { useTranslation } from 'react-i18next';
import { formatMYRNumber } from '@/lib/i18n/format';
import { ProductTypeSelector } from '@/components/vendor/product-type-selector';

interface Props {
  vendorId: string;
  outletIds?: string[];
  initialData?: Partial<ProductCreate> & { id?: string; inventoryConfigured?: boolean; inventorySetupSingleEntry?: boolean };
  onSuccess?: () => void;
  onClose?: () => void;
}

type SuggestionField = 'name' | 'description' | 'tags' | 'category';
const SUGGESTION_FIELDS: SuggestionField[] = ['name', 'description', 'tags', 'category'];
const ALL_SUGGESTION_PICKS: Record<SuggestionField, boolean> = { name: true, description: true, tags: true, category: true };

export default function ProductForm({ vendorId, outletIds, initialData, onSuccess, onClose }: Props) {
  const { t } = useTranslation('vendor');
  const { t: tCommon } = useTranslation('common');
  const { showFeedback } = useActionFeedback();
  const [serverError, setServerError] = useState<string | null>(null);
  const [outlets, setOutlets] = useState<{ id: string; name: string; city?: string | null; state?: string | null }[]>([]);
  const [categories, setCategories] = useState<CanonicalCategoryOption[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestionMessage, setSuggestionMessage] = useState<string | null>(null);
  const [suggestionDraft, setSuggestionDraft] = useState<ListingSuggestion | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  // Which suggested fields the vendor chose to apply; nothing is written until Apply.
  const [suggestionPicks, setSuggestionPicks] = useState<Record<SuggestionField, boolean>>(ALL_SUGGESTION_PICKS);
  const [submitIntent, setSubmitIntent] = useState<'draft' | 'review'>('review');
  const supabase = createClient();
  const validationSchema = initialData?.id ? productUpdateSchema : productCreateSchema;
  const formSchema = validationSchema.extend({
    tags: z.union([z.string(), z.array(z.string().max(50)).max(20)]).optional(),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { register, handleSubmit, getValues, setValue, watch, formState: { errors, isSubmitting, dirtyFields } } = useForm<any>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(formSchema) as any,
    shouldFocusError: true,
    defaultValues: buildProductFormDefaults(initialData),
  });
  // eslint-disable-next-line react-hooks/incompatible-library
  const productType = watch('productType');
  const requiresBooking = watch('requiresBooking');
  const ticketEntryPolicy = watch('ticketEntryPolicy');
  const tags = normalizeProductTags(watch('tags'));
  const selectedCategoryId = watch('categoryId');
  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);
  const typeSlugs = (watch('typeSlugs') || []) as string[];
  const gallery = (watch('gallery') || []) as { url: string; alt?: string }[];

  useEffect(() => {
    let outletsQuery = supabase.from('outlets').select('id, name, city, state').eq('vendor_id', vendorId);
    if (outletIds?.length) outletsQuery = outletsQuery.in('id', outletIds);
    Promise.all([
      outletsQuery,
      supabase.from('categories').select('id, name, slug').eq('is_active', true).order('sort_order'),
    ]).then(([outletResult, categoryResult]) => {
      setOutlets(outletResult.data ?? []);
      setCategories(normalizeCategoryRows((categoryResult.data ?? []) as { id: string; name: string; slug: string | null }[]));
      if (initialData?.categoryId) {
        setValue('categoryId', initialData.categoryId, { shouldDirty: false, shouldTouch: false });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, supabase, initialData?.outletId, initialData?.categoryId, setValue]);

  async function suggestListing() {
    const values = getValues();
    const outlet = outlets.find((item) => item.id === values.outletId);
    setSuggesting(true);
    setSuggestionMessage(null);
    setSuggestionError(null);
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
          priceRange: values.basePrice ? `RM${formatMYRNumber(Number(values.basePrice))}` : undefined,
          // The server resolves the outlet's real name and location from this id within the caller's scope.
          outletId: values.outletId || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t('productForm.aiUnavailable'));
      const suggestion = payload.data?.suggestion;
      if (!suggestion) throw new Error(t('productForm.aiNoSuggestion'));
      setSuggestionDraft(suggestion);
      setSuggestionPicks(ALL_SUGGESTION_PICKS);
      setSuggestionMessage(t('productForm.draftReady'));
    } catch (error) {
      setSuggestionError(error instanceof Error ? error.message : t('productForm.aiDeferred'));
    } finally {
      setSuggesting(false);
    }
  }

  function matchSuggestedCategory(suggestion: ListingSuggestion) {
    const suggestedSlug = canonicalCategorySlug(suggestion.category);
    return categories.find((category) => category.slug === suggestedSlug || category.name.toLowerCase() === suggestion.category.toLowerCase());
  }

  function applySuggestion() {
    if (!suggestionDraft) return;
    // Only the fields the vendor ticked change; saving still goes through the normal product form submit.
    if (suggestionPicks.name) setValue('name', suggestionDraft.title, { shouldDirty: true, shouldValidate: true });
    if (suggestionPicks.description) setValue('description', suggestionDraft.description, { shouldDirty: true });
    if (suggestionPicks.tags) setValue('tags', suggestionDraft.tags.join(', '), { shouldDirty: true });
    const matchedCategory = suggestionPicks.category ? matchSuggestedCategory(suggestionDraft) : undefined;
    if (matchedCategory) {
      setValue('categoryId', matchedCategory.id, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
      setValue('typeSlugs', [], { shouldDirty: true, shouldValidate: true });
    }
    setSuggestionDraft(null);
    setSuggestionMessage(t('productForm.draftApplied'));
  }

  function onInvalid(formErrors: FieldErrors) {
    const firstError = Object.values(formErrors)[0] as { message?: string } | undefined;
    setServerError(firstError?.message || t('productForm.checkFields'));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function onSubmit(data: any, intent: 'draft' | 'review') {
    setServerError(null);
    const normalizedTags = normalizeProductTags(data.tags);
    const normalizedData = {
      name: String(data.name || '').trim(),
      description: data.description ? String(data.description).trim() : undefined,
      productType: data.productType,
      requiresBooking: Boolean(data.requiresBooking),
      ticketEntryPolicy: data.ticketEntryPolicy,
      ticketEntryLimit: data.requiresBooking && data.ticketEntryPolicy !== 'single_entry'
        ? Number(data.ticketEntryLimit)
        : 1,
      ticketValidityDays: data.requiresBooking && data.ticketEntryPolicy === 'multi_entry'
        ? Number(data.ticketValidityDays)
        : undefined,
      basePrice: Number(data.basePrice),
      categoryId: data.categoryId || undefined,
      typeSlugs: data.typeSlugs || [],
      coverUrl: data.coverUrl || undefined,
      tags: normalizedTags.length ? normalizedTags : undefined,
      submissionMode: intent,
      availableStock: data.availableStock === '' || data.availableStock == null ? undefined : Number(data.availableStock),
      lowStockThreshold: data.lowStockThreshold === '' || data.lowStockThreshold == null ? undefined : Number(data.lowStockThreshold),
      defaultCapacity: data.defaultCapacity === '' || data.defaultCapacity == null ? undefined : Number(data.defaultCapacity),
      digitalAssetUrl: data.digitalAssetUrl || undefined,
      digitalAssetName: data.digitalAssetName || undefined,
      digitalAssetType: data.digitalAssetType || undefined,
      digitalAssetSize: data.digitalAssetSize == null ? undefined : Number(data.digitalAssetSize),
      gallery: gallery.length ? gallery : undefined,
      ...(initialData?.id ? {} : { outletId: data.outletId }),
    };
    if (intent === 'review' && !initialData?.id) {
      const readinessErrors = validateProductReviewReadiness({
        productType: normalizedData.productType,
        coverUrl: normalizedData.coverUrl,
        availableStock: normalizedData.availableStock,
        defaultCapacity: normalizedData.defaultCapacity,
        digitalAssetUrl: normalizedData.digitalAssetUrl,
      });
      const firstReadinessError = Object.values(readinessErrors)[0];
      if (firstReadinessError) {
        setServerError(firstReadinessError);
        return;
      }
    }
    try {
      const isEdit = !!initialData?.id;
      const url = isEdit 
        ? `/api/vendors/${vendorId}/products/${initialData.id}` 
        : `/api/vendors/${vendorId}/products`;
        
      const contentFields = ['name', 'description', 'productType', 'requiresBooking', 'ticketEntryPolicy', 'ticketEntryLimit', 'ticketValidityDays', 'basePrice', 'categoryId', 'coverUrl', 'tags', 'defaultCapacity', 'digitalAssetUrl', 'digitalAssetName', 'digitalAssetType', 'digitalAssetSize', 'gallery'];
      const changedFields = Object.keys(dirtyFields).filter((field) => field !== 'typeSlugs' && field !== 'submissionMode');
      const taxonomyOnly = Boolean(isEdit && dirtyFields.typeSlugs && changedFields.length === 0);
      const inventoryOnlySetup = Boolean(initialData?.id && initialData.inventoryConfigured === false && initialData.inventorySetupSingleEntry !== false && !contentFields.some((field) => dirtyFields[field]));
      const requestData = taxonomyOnly
        ? { typeSlugs: normalizedData.typeSlugs }
        : inventoryOnlySetup
        ? {
            ...(normalizedData.availableStock !== undefined ? { availableStock: normalizedData.availableStock } : {}),
            ...(dirtyFields.lowStockThreshold && normalizedData.lowStockThreshold !== undefined ? { lowStockThreshold: normalizedData.lowStockThreshold } : {}),
          }
        : normalizedData;
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData),
      });
      
      const result = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = result?.error?.details?.fieldErrors;
        const fieldMessage = detail && Object.values(detail).flat().find(Boolean);
        setServerError(String(fieldMessage || result?.error?.message || t('productForm.saveFailed')));
        showFeedback('error', String(fieldMessage || result?.error?.message || t('productForm.saveFailed')));
        return;
      }
      showFeedback('success', initialData?.id ? t('productForm.updated') : intent === 'draft' ? t('productForm.savedDraft') : t('productForm.submitted'));
      onSuccess?.();
    } catch (error) {
      console.error('Product save failed', error);
      setServerError(tCommon('errors.network'));
      showFeedback('error', t('productForm.saveNetworkError'));
    }
  }

  function submitForm(intent: 'draft' | 'review') {
    setSubmitIntent(intent);
    setValue('submissionMode', intent, { shouldDirty: true, shouldValidate: true });
    void handleSubmit((data) => onSubmit(data, intent), onInvalid)();
  }

  return (
    <form onSubmit={(event) => { event.preventDefault(); submitForm('review'); }} className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">{initialData?.id ? t('productForm.editTitle') : t('productForm.addTitle')}</h2>
        {onClose && <button type="button" onClick={onClose} className="text-gray-400 dark:text-muted-foreground hover:text-gray-600 dark:hover:text-muted-foreground">✕</button>}
      </div>

      {serverError && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-200 text-sm rounded-lg px-4 py-3">
          {serverError}
        </div>
      )}

      <AiWritingAssistant
        label={t('assistant.listingLabel')}
        buttonLabel={t('assistant.suggestListing')}
        busy={suggesting}
        error={suggestionError}
        draft={suggestionDraft && (() => {
          const current = getValues();
          const matchedCategory = matchSuggestedCategory(suggestionDraft);
          const currentCategory = categories.find((category) => category.id === current.categoryId)?.name ?? '';
          const rows: { field: SuggestionField; label: string; before: string; after: string; disabled?: boolean }[] = [
            { field: 'name', label: t('productForm.nameRequired').replace(/\s*\*$/, ''), before: String(current.name || ''), after: suggestionDraft.title },
            { field: 'description', label: t('productForm.description'), before: String(current.description || ''), after: suggestionDraft.description },
            { field: 'tags', label: t('productForm.tags'), before: String(current.tags || ''), after: suggestionDraft.tags.join(', ') },
            // A category the catalogue does not offer cannot be applied, so it is shown but not selectable.
            { field: 'category', label: t('productForm.category'), before: currentCategory, after: matchedCategory?.name ?? suggestionDraft.category, disabled: !matchedCategory },
          ];
          return (
            <ul className="divide-y divide-violet-100 dark:divide-violet-500/20">
              {rows.filter((row) => row.after.trim() && row.after.trim() !== row.before.trim()).map((row) => (
                <li key={row.field} className="py-2 first:pt-0 last:pb-0">
                  <label className={`flex items-start gap-2.5 ${row.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      className="mt-1 size-4 shrink-0 accent-primary"
                      checked={!row.disabled && suggestionPicks[row.field]}
                      disabled={row.disabled}
                      onChange={(event) => setSuggestionPicks((prev) => ({ ...prev, [row.field]: event.target.checked }))}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-gray-500 dark:text-muted-foreground">{row.label}</span>
                      {row.before && <span className="block break-words text-xs text-gray-500 line-through decoration-gray-400/70 dark:text-muted-foreground">{row.before}</span>}
                      <span className="block break-words text-sm text-gray-900 dark:text-foreground">{row.after}</span>
                      {row.disabled && <span className="block text-xs text-amber-700 dark:text-amber-300">{t('productForm.aiCategoryUnavailable')}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          );
        })()}
        onGenerate={() => void suggestListing()}
        onApply={suggestionDraft && SUGGESTION_FIELDS.some((field) => suggestionPicks[field]) ? applySuggestion : undefined}
        onDiscard={suggestionDraft ? () => setSuggestionDraft(null) : undefined}
      />
      {suggestionMessage && <p className="text-xs text-violet-800 dark:text-violet-200" role="status">{suggestionMessage}</p>}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('productForm.nameRequired')}</label>
          <Input {...register('name')} placeholder={t('productForm.namePlaceholder')} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {errors.name && <p className="text-red-500 text-xs mt-1">{(errors.name as any)?.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('productForm.description')}</label>
          <textarea
            {...register('description')}
            rows={3}
            className="w-full border border-gray-300 dark:border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder={t('productForm.descriptionPlaceholder')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('productForm.typeRequired')}</label>
            <select {...register('productType')} className="w-full border border-gray-300 dark:border-border rounded-lg px-3 py-2 text-sm">
              <option value="product">{t('productForm.types.product')}</option>
              <option value="activity">{t('productForm.types.activity')}</option>
              <option value="experience">{t('productForm.types.experience')}</option>
              <option value="food">{t('productForm.types.food')}</option>
              <option value="digital">{t('productForm.types.digital')}</option>
              <option value="service">{t('productForm.types.service')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('productForm.basePrice')}</label>
            <Input {...register('basePrice', { valueAsNumber: true })} type="number" step="0.01" />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {errors.basePrice && <p className="text-red-500 text-xs mt-1">{(errors.basePrice as any)?.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('productForm.category')}</label>
            <select {...register('categoryId', { onChange: (event) => {
              if (event.target.value !== selectedCategoryId) setValue('typeSlugs', [], { shouldDirty: true, shouldValidate: true });
            } })} className="w-full border border-gray-300 dark:border-border rounded-lg px-3 py-2 text-sm">
              <option value="">{t('productForm.selectCategory')}</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {errors.categoryId && <p className="text-red-500 text-xs mt-1">{(errors.categoryId as any)?.message || t('productForm.categoryInvalid')}</p>}
          </div>
        </div>

        <ProductTypeSelector
          categorySlug={selectedCategory?.slug}
          value={typeSlugs}
          onChange={(next) => setValue('typeSlugs', next, { shouldDirty: true, shouldValidate: true })}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('productForm.tags')}</label>
          <Input {...register('tags')} placeholder={t('productForm.tagsPlaceholder')} />
          <div className="mt-2 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setValue('tags', tags.filter((item) => item !== tag).join(', '), { shouldDirty: true })}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-primary hover:bg-secondary/80"
                title={t('productForm.removeTag', { tag })}
              >
                {tag} <Trash2 size={12} />
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-400 dark:text-muted-foreground">{t('productForm.tagsHint')}</p>
        </div>

        <div className="rounded-xl border border-gray-100 dark:border-border bg-gray-50/70 dark:bg-muted/70 p-4">
          <div className="mb-3 flex items-center gap-2">
            <ImagePlus size={17} className="text-primary" />
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-foreground">{t('productForm.media')}</p>
              <p className="text-xs text-gray-500 dark:text-muted-foreground">{t('productForm.coverRequired')}</p>
            </div>
          </div>
          <ProductMediaUploader
            shape="photo"
            vendorId={vendorId}
            productId={initialData?.id}
            value={watch('coverUrl')}
            onUploaded={(media) => setValue('coverUrl', media.url, { shouldDirty: true, shouldValidate: true })}
            onError={(message) => setServerError(message || null)}
          />
          <Input {...register('coverUrl')} placeholder={t('productForm.imageUrlPlaceholder')} className="mt-2" />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {errors.coverUrl && <p className="mt-1 text-xs text-red-600 dark:text-red-300">{(errors.coverUrl as any)?.message}</p>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {watch('coverUrl') && <div className="mt-3 flex items-center gap-3 rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-card p-2"><img src={watch('coverUrl')} alt={t('productForm.coverPreview')} className="h-14 w-20 rounded-md object-cover" /><span className="truncate text-xs text-gray-500 dark:text-muted-foreground">{watch('coverUrl')}</span></div>}
          <div className="mt-4 border-t border-gray-200 dark:border-border pt-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 dark:text-muted-foreground">{t('productForm.gallery')}</p>
              <span className="text-[11px] text-gray-400 dark:text-muted-foreground">{gallery.length}/8 {t('productForm.images')}</span>
            </div>
            {gallery.length < 8 && (
              <ProductMediaUploader
                shape="photo"
                vendorId={vendorId}
                productId={initialData?.id}
                value={null}
                onUploaded={(media) => setValue('gallery', [...gallery, { url: media.url, alt: media.fileName }], { shouldDirty: true })}
                onError={(message) => setServerError(message || null)}
              />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {gallery.length > 0 && <div className="mt-3 grid grid-cols-4 gap-2">{gallery.map((media, index) => <div key={media.url} className="group relative overflow-hidden rounded-lg border border-gray-200 dark:border-border"><img src={media.url} alt={media.alt || t('productForm.galleryImageAlt', { count: index + 1 })} className="h-16 w-full object-cover" /><button type="button" onClick={() => setValue('gallery', gallery.filter((_, itemIndex) => itemIndex !== index), { shouldDirty: true })} className="absolute right-1 top-1 rounded-md bg-gray-950/70 p-1 text-white opacity-0 transition group-hover:opacity-100" aria-label={t('productForm.removeGalleryImage', { count: index + 1 })}><Trash2 size={12} /></button></div>)}</div>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('productForm.outletRequired')}</label>
            {initialData?.id ? (
              <div className="rounded-lg border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/50 px-3 py-2 text-sm text-gray-700 dark:text-foreground">
                {outlets.find((outlet) => outlet.id === initialData.outletId)?.name || t('productForm.loadingOutlet')}
                <p className="mt-1 text-xs text-gray-400 dark:text-muted-foreground">{t('productForm.outletLocked')}</p>
              </div>
            ) : (
              <>
                <select {...register('outletId')} className="w-full border border-gray-300 dark:border-border rounded-lg px-3 py-2 text-sm">
                  <option value="">{t('productForm.selectOutlet')}</option>
                  {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {errors.outletId && <p className="text-red-500 text-xs mt-1">{(errors.outletId as any)?.message}</p>}
              </>
            )}
          </div>
          <div className="flex items-center pt-6">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-foreground cursor-pointer">
              <input type="checkbox" {...register('requiresBooking')} className="rounded border-gray-300 dark:border-border text-primary focus:ring-primary/20" />
              {t('productForm.requiresBooking')}
            </label>
          </div>
        </div>

        {requiresBooking && (
          <section className="rounded-xl border border-primary/15 bg-secondary/25 p-4">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-foreground">{t('productForm.ticketAdmission')}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{t('productForm.ticketAdmissionHint')}</p>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-foreground">
                {t('productForm.entryPolicy')}
                <select {...register('ticketEntryPolicy')} className="mt-1 w-full rounded-lg border border-gray-300 dark:border-border bg-white dark:bg-card px-3 py-2 text-sm">
                  <option value="single_entry">{t('productForm.singleEntry')}</option>
                  <option value="group_entry">{t('productForm.groupEntry')}</option>
                  <option value="multi_entry">{t('productForm.multiEntry')}</option>
                </select>
              </label>
              {ticketEntryPolicy !== 'single_entry' && (
                <label className="block text-sm font-medium text-gray-700 dark:text-foreground">
                  {ticketEntryPolicy === 'group_entry' ? t('productForm.entriesIncluded') : t('productForm.visitsIncluded')}
                  <Input {...register('ticketEntryLimit', { valueAsNumber: true })} className="mt-1" type="number" min="2" max="1000" step="1" />
                </label>
              )}
              {ticketEntryPolicy === 'multi_entry' && (
                <label className="block text-sm font-medium text-gray-700 dark:text-foreground sm:col-span-2">
                  {t('productForm.passValidityDays')}
                  <Input {...register('ticketValidityDays', { valueAsNumber: true })} className="mt-1" type="number" min="1" max="365" step="1" />
                  <span className="mt-1 block text-xs font-normal text-gray-500 dark:text-muted-foreground">{t('productForm.validityHint')}</span>
                </label>
              )}
            </div>
            {ticketEntryPolicy === 'single_entry' && <p className="mt-3 text-xs text-gray-600 dark:text-muted-foreground">{t('productForm.singleEntryHint')}</p>}
            {ticketEntryPolicy === 'group_entry' && <p className="mt-3 text-xs text-gray-600 dark:text-muted-foreground">{t('productForm.groupEntryHint')}</p>}
            {ticketEntryPolicy === 'multi_entry' && <p className="mt-3 text-xs text-gray-600 dark:text-muted-foreground">{t('productForm.multiEntryHint')}</p>}
          </section>
        )}

        <div className="rounded-xl border border-gray-100 dark:border-border bg-white dark:bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-foreground">{t('productForm.availability')}</p>
            </div>
            <span className="rounded-full bg-gray-100 dark:bg-muted px-2.5 py-1 text-[11px] font-semibold text-gray-500 dark:text-muted-foreground">{productType}</span>
          </div>
          {['product', 'food'].includes(productType) && !requiresBooking && (
            initialData?.id && initialData.inventorySetupSingleEntry === false
              ? <p className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-900 dark:text-amber-200" role="status">{t('productForm.variantStockHint')}</p>
              : <div className="grid grid-cols-2 gap-4">
                  {initialData?.id && initialData.inventoryConfigured === false && <p className="col-span-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-900 dark:text-amber-200" role="status">{t('productForm.stockSetupHint')}</p>}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('productForm.initialStock')}</label>
                    <Input {...register('availableStock', { setValueAs: (value) => value === '' ? undefined : Number(value) })} type="number" min="0" step="1" placeholder={initialData?.id && initialData.inventoryConfigured === false ? t('productForm.stockQuantityPlaceholder') : '0'} />
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {errors.availableStock && <p className="mt-1 text-xs text-red-600 dark:text-red-300">{(errors.availableStock as any)?.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('productForm.lowStockAlert')}</label>
                    <Input {...register('lowStockThreshold', { setValueAs: (value) => value === '' ? undefined : Number(value) })} type="number" min="0" step="1" placeholder="5" />
                  </div>
                </div>
          )}
          {['activity', 'experience', 'service'].includes(productType) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('productForm.defaultCapacity')}</label>
              <Input {...register('defaultCapacity', { setValueAs: (value) => value === '' ? undefined : Number(value) })} type="number" min="1" step="1" placeholder={t('productForm.capacityPlaceholder')} />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {errors.defaultCapacity && <p className="mt-1 text-xs text-red-600 dark:text-red-300">{(errors.defaultCapacity as any)?.message}</p>}
              <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{t('productForm.capacityHint')}</p>
            </div>
          )}
          {productType === 'digital' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('productForm.downloadUrl')}</label>
              <ProductMediaUploader
                vendorId={vendorId}
                productId={initialData?.id}
                kind="digital"
                value={watch('digitalAssetUrl')}
                onUploaded={(media) => {
                  setValue('digitalAssetUrl', media.url, { shouldDirty: true, shouldValidate: true });
                  setValue('digitalAssetName', media.fileName, { shouldDirty: true });
                  setValue('digitalAssetType', media.fileType, { shouldDirty: true });
                  setValue('digitalAssetSize', media.fileSize, { shouldDirty: true });
                }}
                onError={(message) => setServerError(message || null)}
              />
              <Input {...register('digitalAssetUrl')} placeholder={t('productForm.downloadUrlPlaceholder')} className="mt-2" />
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {errors.digitalAssetUrl && <p className="mt-1 text-xs text-red-600 dark:text-red-300">{(errors.digitalAssetUrl as any)?.message}</p>}
              <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">{t('productForm.digitalAssetHint')}</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-gray-100 dark:border-border pt-4 sm:flex sm:justify-end sm:gap-3">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">{tCommon('actions.cancel')}</Button>
        )}
        <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => submitForm('draft')} className="w-full sm:w-auto">
          {isSubmitting && submitIntent === 'draft' ? t('productForm.savingDraft') : t('productForm.saveDraft')}
        </Button>
        <Button type="button" disabled={isSubmitting} onClick={() => submitForm('review')} className="col-span-2 w-full sm:col-span-1 sm:w-auto">
          {isSubmitting && submitIntent === 'review' ? t('productForm.submitting') : <><Check size={15} /> {t('productForm.submitReview')}</>}
        </Button>
      </div>
    </form>
  );
}
