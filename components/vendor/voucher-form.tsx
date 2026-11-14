'use client';
// P2 — Member 2: Voucher creation form (B3)

import { useState, useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { voucherCreateSchema } from '@/lib/validation/vendor-schemas';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { localDateTimeToIso, optionalNumber, optionalSelect } from '@/lib/vendor/voucher-form-values';
import ActionConfirmationDialog from '@/components/vendor/action-confirmation-dialog';
import { useTranslation } from 'react-i18next';
import { formatMYR, formatNumber } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';
import { getMalaysiaDateTimeRangeDefaults } from '@/lib/datetime/date-input';

interface Props {
  vendorId: string;
  initialOutletId?: string;
  isOutletManager?: boolean;
  onSuccess?: () => void;
  onClose?: () => void;
}

type VoucherFormInput = z.input<typeof voucherCreateSchema>;
type VoucherFormData = z.output<typeof voucherCreateSchema>;

// Native selects share the Input control look; aria-invalid carries the error border.
const selectClassName = "h-9 w-full rounded-md border border-input bg-input-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30";

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground">{children}</h3>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600 dark:text-red-300" role="alert">{message}</p>;
}

export default function VoucherForm({ vendorId, initialOutletId, isOutletManager = false, onSuccess, onClose }: Props) {
  const { showFeedback } = useActionFeedback();
  const { t, i18n } = useTranslation('vendor');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [serverError, setServerError] = useState<string | null>(null);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [pendingData, setPendingData] = useState<VoucherFormData | null>(null);
  const [confirming, setConfirming] = useState(false);
  const validityDefaults = getMalaysiaDateTimeRangeDefaults();
  const { register, handleSubmit, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm<VoucherFormInput, unknown, VoucherFormData>({
    resolver: zodResolver(voucherCreateSchema),
    defaultValues: { voucherType: 'fixed', minSpend: 0, redemptionMode: 'online', isClaimable: true, validFrom: validityDefaults.from, validUntil: validityDefaults.to, ...(initialOutletId ? { outletId: initialOutletId } : {}) },
  });

  function fieldError(field: keyof VoucherFormInput) {
    const message = errors[field]?.message;
    return typeof message === 'string' ? message : undefined;
  }

  function inputClass(field: keyof VoucherFormInput) {
    return `w-full ${fieldError(field) ? 'border-red-400 focus-visible:ring-red-300' : ''}`;
  }

  useEffect(() => {
    Promise.all([
      fetch(`/api/vendors/${vendorId}/outlets?page=1&pageSize=100&sort=name`, { cache: 'no-store' }),
      fetch(`/api/vendors/${vendorId}/products?page=1&pageSize=24&sort=name`, { cache: 'no-store' }),
    ]).then(async ([outletResponse, productResponse]) => {
      const [outletPayload, productPayload] = await Promise.all([outletResponse.json(), productResponse.json()]);
      if (!outletResponse.ok) throw new Error(outletPayload.error?.message || t('ui.vouchers.loadOutletsFailed'));
      if (!productResponse.ok) throw new Error(productPayload.error?.message || t('ui.vouchers.loadProductsFailed'));
      setOutlets(outletPayload.data?.items ?? []);
      setProducts(productPayload.data?.items ?? []);
    }).catch((error) => setServerError(error instanceof Error ? error.message : t('ui.vouchers.loadOptionsFailed')));
  }, [t, vendorId]);

  useEffect(() => {
    if (isOutletManager && initialOutletId) setValue('outletId', initialOutletId, { shouldValidate: true });
  }, [initialOutletId, isOutletManager, setValue]);

  async function generateCode() {
    setGeneratingCode(true);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/vouchers/generate-code`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t('voucher.form.generateCodeFailed'));
      setValue('code', payload.data.code, { shouldDirty: true, shouldValidate: true });
      showFeedback('success', t('voucher.form.codeGenerated'));
    } catch (error) {
      const message = error instanceof Error ? error.message : t('voucher.form.generateCodeFailed');
      setServerError(message);
      showFeedback('error', message);
    } finally {
      setGeneratingCode(false);
    }
  }

  async function submitVoucher(data: VoucherFormData) {
    setConfirming(true);
    setServerError(null);
    try {
      const payload = {
        ...data,
        validFrom: data.validFrom ? new Date(data.validFrom).toISOString() : undefined,
        validUntil: data.validUntil ? new Date(data.validUntil).toISOString() : undefined,
      };
      const res = await fetch(`/api/vendors/${vendorId}/vouchers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      const result = await res.json();
      if (!res.ok) {
        const message = result.error?.message ?? t('voucher.form.saveFailed');
        const fieldErrors = result.error?.details?.fieldErrors as Record<string, string[]> | undefined;
        Object.entries(fieldErrors ?? {}).forEach(([field, messages]) => {
          if (field in errors || field in { code: true, name: true, voucherType: true, discountValue: true, minSpend: true, maxUses: true, perCustomerLimit: true, validFrom: true, validUntil: true, redemptionMode: true, outletId: true, productId: true, buyQuantity: true, freeQuantity: true }) {
            setError(field as keyof VoucherFormInput, { type: 'server', message: messages[0] });
          }
        });
        setServerError(message);
        showFeedback('error', message);
        return;
      }
      showFeedback('success', t('voucher.form.created'));
      setPendingData(null);
      onSuccess?.();
    } catch {
      setServerError(t('voucher.form.network'));
      showFeedback('error', t('voucher.form.saveRetry'));
    } finally {
      setConfirming(false);
    }
  }

  function onSubmit(data: VoucherFormData) {
    setPendingData(data);
  }

  function onInvalid() {
    setServerError(t('voucher.form.fixFields'));
    showFeedback('error', t('voucher.form.fixFields'));
  }

  // eslint-disable-next-line react-hooks/incompatible-library
  const voucherType = watch('voucherType');
  const discountValue = watch('discountValue');
  const minSpend = watch('minSpend');
  const maxUses = watch('maxUses');
  const perCustomerLimit = watch('perCustomerLimit');
  const selectedOutlet = watch('outletId');
  const selectedValidFrom = watch('validFrom');
  const redemptionMode = watch('redemptionMode');
  const discountSummary = voucherType === 'bogo'
    ? t('voucher.form.buyXGetY')
    : voucherType === 'percent'
      ? t('voucher.form.percentOff', { value: formatNumber(Number(discountValue || 0), locale) })
      : t('voucher.form.amountOff', { value: formatMYR(Number(discountValue || 0), locale, { minimumFractionDigits: 2 }) });
  const pendingSummary = pendingData
    ? `${pendingData.code} · ${pendingData.voucherType === 'bogo' ? t('voucher.form.buyGet', { buy: pendingData.buyQuantity, free: pendingData.freeQuantity }) : pendingData.voucherType === 'percent' ? t('voucher.form.percentOff', { value: formatNumber(Number(pendingData.discountValue || 0), locale) }) : t('voucher.form.amountOff', { value: formatMYR(Number(pendingData.discountValue || 0), locale, { minimumFractionDigits: 2 }) })}`
    : '';

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">{t('voucher.form.create')}</h2>
        {onClose && <button type="button" onClick={onClose} aria-label={t('actions.close')} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X size={18} aria-hidden="true" /></button>}
      </div>

      {serverError && (
        <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200" role="alert">
          {serverError}
        </div>
      )}

      <div className="space-y-5">
        <SectionTitle>{t('voucher.form.sections.basics')}</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('voucher.form.code')} *</label>
            <div className="flex gap-2">
              <Input {...register('code')} aria-invalid={Boolean(fieldError('code'))} aria-describedby={fieldError('code') ? 'voucher-code-error' : undefined} className={`uppercase ${inputClass('code')}`} placeholder={t('voucher.form.exampleCode')} />
              <Button type="button" variant="outline" disabled={generatingCode} onClick={() => void generateCode()}>{generatingCode ? '…' : t('voucher.form.auto')}</Button>
            </div>
            <span id="voucher-code-error"><FieldError message={fieldError('code')} /></span>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('voucher.form.name')} *</label>
            <Input {...register('name')} aria-invalid={Boolean(fieldError('name'))} className={inputClass('name')} placeholder={t('voucher.form.exampleName')} />
            <FieldError message={fieldError('name')} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('strictMigration.redemptionModeRequired')}</label>
          <select {...register('redemptionMode')} aria-invalid={Boolean(fieldError('redemptionMode'))} className={selectClassName}>
            <option value="online">{t("voucher.form.onlineCheckout")}</option>
            <option value="both">{t("voucher.form.onlineOrInStore")}</option>
            <option value="in_store">{t("voucher.form.inStoreOnly")}</option>
          </select>
          <FieldError message={fieldError('redemptionMode')} />
        </div>

        <div className="border-t border-border pt-5"><SectionTitle>{t('voucher.form.sections.discount')}</SectionTitle></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('voucher.form.type')} *</label>
            <select {...register('voucherType')} aria-invalid={Boolean(fieldError('voucherType'))} className={selectClassName}>
              <option value="fixed">{t('voucher.form.fixedAmount')}</option>
              <option value="percent">{t('voucher.form.percentage')}</option>
              <option value="bogo">{t('voucher.form.buyXGetY')}</option>
            </select>
            <FieldError message={fieldError('voucherType')} />
          </div>
          
          <div className={voucherType === 'bogo' ? 'hidden' : ''}>
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('voucher.form.discountValue')} *</label>
            <Input {...register('discountValue', { setValueAs: optionalNumber })} aria-invalid={Boolean(fieldError('discountValue'))} className={inputClass('discountValue')} type="number" step="0.01" />
            <FieldError message={fieldError('discountValue')} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('voucher.form.applicableProduct')} {voucherType === 'bogo' ? '*' : t('voucher.form.optional')}</label>
          <select {...register('productId', { setValueAs: optionalSelect })} aria-invalid={Boolean(fieldError('productId'))} className={selectClassName}>
            <option value="">{t('voucher.form.allProducts')}</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
          <FieldError message={fieldError('productId')} />
        </div>

        {voucherType === 'bogo' && <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-muted/40 p-3">
          <div><label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('voucher.form.buyQuantity')} *</label><Input {...register('buyQuantity', { setValueAs: optionalNumber })} aria-invalid={Boolean(fieldError('buyQuantity'))} className={inputClass('buyQuantity')} type="number" min="1" /><FieldError message={fieldError('buyQuantity')} /></div>
          <div><label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('voucher.form.freeQuantity')} *</label><Input {...register('freeQuantity', { setValueAs: optionalNumber })} aria-invalid={Boolean(fieldError('freeQuantity'))} className={inputClass('freeQuantity')} type="number" min="1" /><FieldError message={fieldError('freeQuantity')} /></div>
          <p className="col-span-2 text-xs text-muted-foreground">{t('voucher.form.bogoExample')}</p>
        </div>}

        <div className="border-t border-border pt-5"><SectionTitle>{t('voucher.form.sections.limits')}</SectionTitle></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('voucher.form.minSpend')}</label>
            <Input {...register('minSpend', { setValueAs: optionalNumber })} aria-invalid={Boolean(fieldError('minSpend'))} className={inputClass('minSpend')} type="number" step="0.01" placeholder={t('voucher.form.noMinimum')} />
            <FieldError message={fieldError('minSpend')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('voucher.form.maxUses')}</label>
            <Input {...register('maxUses', { setValueAs: optionalNumber })} aria-invalid={Boolean(fieldError('maxUses'))} className={inputClass('maxUses')} type="number" min="1" placeholder={t('voucher.form.unlimited')} />
            <FieldError message={fieldError('maxUses')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('voucher.form.perCustomerLimit')}</label>
            <Input {...register('perCustomerLimit', { setValueAs: optionalNumber })} aria-invalid={Boolean(fieldError('perCustomerLimit'))} className={inputClass('perCustomerLimit')} type="number" min="1" placeholder={t('voucher.form.unlimited')} />
            <FieldError message={fieldError('perCustomerLimit')} />
          </div>
        </div>

        <div className="border-t border-border pt-5"><SectionTitle>{t('voucher.form.sections.validity')}</SectionTitle></div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('voucher.form.validFrom')}</label>
            <Input {...register('validFrom', { setValueAs: localDateTimeToIso })} aria-invalid={Boolean(fieldError('validFrom'))} className={inputClass('validFrom')} type="datetime-local" />
            <FieldError message={fieldError('validFrom')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('voucher.form.validUntil')}</label>
            <Input {...register('validUntil', { setValueAs: localDateTimeToIso })} aria-invalid={Boolean(fieldError('validUntil'))} className={inputClass('validUntil')} type="datetime-local" min={selectedValidFrom || undefined} />
            <FieldError message={fieldError('validUntil')} />
          </div>
        </div>

        <div className="border-t border-border pt-5"><SectionTitle>{t('voucher.form.sections.where')}</SectionTitle></div>
        {isOutletManager ? <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('voucher.form.assignedOutlet')}</label>
          <input type="hidden" {...register('outletId')} value={initialOutletId ?? ''} readOnly />
          <div className="rounded-lg border border-primary/20 bg-secondary px-3 py-2 text-sm font-semibold text-primary">
            {outlets.find((outlet) => outlet.id === initialOutletId)?.name ?? t('voucher.form.assignedOutlet')}
          </div>
          <FieldError message={fieldError('outletId')} />
        </div> : <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">{t('strictMigration.specificOutletOptional')}</label>
          <select {...register('outletId', { setValueAs: optionalSelect })} aria-invalid={Boolean(fieldError('outletId'))} className={selectClassName}>
            <option value="">{t('voucher.form.allOutlets')}</option>
            {outlets.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <FieldError message={fieldError('outletId')} />
        </div>}
      </div>

      <div className="rounded-xl border border-gray-100 dark:border-border bg-gray-50 dark:bg-muted/50 px-4 py-3 text-xs text-gray-600 dark:text-muted-foreground">
        <p className="font-semibold text-gray-900 dark:text-foreground">{t('voucher.form.summary')}</p>
        <p className="mt-1">{discountSummary} · {redemptionMode === 'both' ? t('voucher.form.onlineOrInStore') : redemptionMode === 'in_store' ? t('voucher.form.inStoreOnly') : t('voucher.form.onlineCheckout')} · {t('voucher.form.summaryMinSpend', { amount: formatMYR(Number(minSpend || 0), locale, { minimumFractionDigits: 2 }) })} · {maxUses ? t('voucher.form.totalUses', { count: formatNumber(Number(maxUses), locale) }) : t('voucher.form.unlimitedTotalUses')} · {perCustomerLimit ? t('voucher.form.perCustomer', { count: formatNumber(Number(perCustomerLimit), locale) }) : t('voucher.form.unlimitedPerCustomer')} · {selectedOutlet ? t('voucher.form.outletRestricted') : t('voucher.form.allOutlets')}</p>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-border">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose}>{t('actions.cancel')}</Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('actions.saving') : t('voucher.form.create')}
        </Button>
      </div>
      <ActionConfirmationDialog open={Boolean(pendingData)} title={t('voucher.form.confirmTitle')} description={`${pendingSummary}. ${t('voucher.form.confirmDescription')}`} confirmLabel={t('voucher.form.submitForReview')} tone="primary" busy={confirming} onCancel={() => { if (!confirming) setPendingData(null); }} onConfirm={() => { if (pendingData) void submitVoucher(pendingData); }} />
    </form>
  );
}
