'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { eventPromotionSubmitSchema } from '@/lib/validation/vendor-schemas';
import { eventPromotionFormErrors, type EventPromotionFormField } from '@/lib/vendor/event-promotion-form-errors';
import { ImagePlus, Loader2, Megaphone, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { EventPromotionAvailabilityCalendar } from '@/components/vendor/event-promotion-availability-calendar';
import { formatMYR } from '@/lib/i18n/format';
import { VendorPageHeader } from '@/components/vendor/vendor-page-header';

interface EventPromotion {
  id: string;
  title: string;
  details: string;
  startDate: string;
  endDate: string;
  posterUrl: string;
  status: 'pending' | 'approved' | 'paid' | 'rejected' | 'changes_requested';
  rejectionReason: string | null;
  changesRequestedReason: string | null;
  amountSen: number | null;
  paymentMethod: 'wallet' | 'stripe' | null;
}

type FormState = { title: string; details: string; startDate: string; endDate: string; posterUrl: string };

const EMPTY_FORM: FormState = { title: '', details: '', startDate: '', endDate: '', posterUrl: '' };

function dayCount(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  const days = Math.round((end - start) / 86_400_000) + 1;
  return days > 0 ? days : 0;
}

export default function VendorEventPromotionsPage() {
  const { t } = useTranslation('vendor');
  const { user } = useAuth();
  const { showFeedback } = useActionFeedback();
  const vendorId = user?.activeVendorId;

  const [promotions, setPromotions] = useState<EventPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<EventPromotionFormField, string>>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [costPerDaySen, setCostPerDaySen] = useState(10_000);

  const load = useCallback(async () => {
    if (!vendorId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/event-promotions`, { cache: 'no-store' });
      const body = await response.json() as { data?: { promotions?: EventPromotion[] }; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? t('ui.eventPromotions.loadError'));
      setPromotions(body.data.promotions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ui.eventPromotions.loadError'));
    } finally {
      setLoading(false);
    }
  }, [vendorId, t]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch('/api/admin/event-promotion-settings', { cache: 'no-store' });
        const body = await response.json() as { data?: { costPerDaySen?: number } };
        if (response.ok && typeof body.data?.costPerDaySen === 'number') setCostPerDaySen(body.data.costPerDaySen);
      } catch {
        // Keep the RM100/day default — this is only a display preview; the
        // server recomputes the real charge at payment time regardless.
      }
    })();
  }, []);

  function startEdit(promotion: EventPromotion) {
    setEditingId(promotion.id);
    setForm({
      title: promotion.title,
      details: promotion.details,
      startDate: promotion.startDate,
      endDate: promotion.endDate,
      posterUrl: promotion.posterUrl,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function clearFieldError(field: EventPromotionFormField) {
    setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  }

  async function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !vendorId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`/api/vendors/${vendorId}/event-promotions/upload`, { method: 'POST', body: formData });
      const body = await response.json() as { data?: { url?: string }; error?: { message?: string } };
      if (!response.ok || !body.data?.url) throw new Error(body.error?.message ?? t('ui.eventPromotions.uploadError'));
      setForm((prev) => ({ ...prev, posterUrl: body.data!.url! }));
      clearFieldError('posterUrl');
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : t('ui.eventPromotions.uploadError'));
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  function removeImage() {
    setForm((prev) => ({ ...prev, posterUrl: '' }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!vendorId || submitting) return;
    const payload = {
      title: form.title.trim(),
      details: form.details.trim(),
      startDate: form.startDate,
      endDate: form.endDate,
      posterUrl: form.posterUrl,
    };
    // The same schema the API applies, so the vendor is told which field to fix before anything is sent.
    const check = eventPromotionSubmitSchema.safeParse(payload);
    if (!check.success) {
      setFieldErrors(eventPromotionFormErrors(check.error.flatten().fieldErrors, Boolean(form.startDate && form.endDate)));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const response = editingId
        ? await fetch(`/api/vendors/${vendorId}/event-promotions/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        : await fetch(`/api/vendors/${vendorId}/event-promotions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      const body = await response.json() as { error?: { code?: string; message?: string; details?: { fieldErrors?: Record<string, string[]> } } };
      if (!response.ok) {
        // A 422 that slipped past the browser check still names its fields; show them in place.
        const fields = body.error?.code === 'VALIDATION_FAILED' ? eventPromotionFormErrors(body.error.details?.fieldErrors ?? {}, Boolean(payload.startDate && payload.endDate)) : {};
        if (Object.keys(fields).length > 0) {
          setFieldErrors(fields);
          return;
        }
        throw new Error(body.error?.message ?? t('ui.eventPromotions.submitError'));
      }
      showFeedback('success', editingId ? t('ui.eventPromotions.resubmitSuccess') : t('ui.eventPromotions.submitSuccess'));
      cancelEdit();
      await load();
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : t('ui.eventPromotions.submitError'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePay(promotionId: string) {
    if (!vendorId || payingId) return;
    setPayingId(promotionId);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/event-promotions/${promotionId}/pay`, { method: 'POST' });
      const body = await response.json() as { data?: { paid?: boolean; checkoutUrl?: string }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? t('ui.eventPromotions.payError'));
      if (body.data?.paid) {
        showFeedback('success', t('ui.eventPromotions.paySuccess'));
        await load();
      } else if (body.data?.checkoutUrl) {
        window.location.href = body.data.checkoutUrl;
      }
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : t('ui.eventPromotions.payError'));
    } finally {
      setPayingId(null);
    }
  }

  if (!vendorId) {
    return <div className="p-8 text-sm text-muted-foreground">{t('ui.eventPromotions.noVendor')}</div>;
  }

  return (
    <div className="w-full space-y-8">
      <VendorPageHeader eyebrow={<><Megaphone size={15} aria-hidden="true" /> {t('navigationSections.promotion')}</>} title={t('ui.eventPromotions.title')} />

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">
          {editingId ? t('ui.eventPromotions.editHeading') : t('ui.eventPromotions.newHeading')}
        </h2>

        <div>
          <label htmlFor="event-title" className="mb-1 block text-xs font-semibold text-muted-foreground">{t('ui.eventPromotions.fields.title')}</label>
          <Input id="event-title" value={form.title} onChange={(e) => { setForm((prev) => ({ ...prev, title: e.target.value })); clearFieldError('title'); }} maxLength={120} aria-invalid={Boolean(fieldErrors.title)} aria-describedby={fieldErrors.title ? 'event-title-error' : undefined} />
          {fieldErrors.title && <p id="event-title-error" role="alert" className="mt-1 text-xs text-destructive">{t(fieldErrors.title)}</p>}
        </div>

        <div>
          <label htmlFor="event-details" className="mb-1 block text-xs font-semibold text-muted-foreground">{t('ui.eventPromotions.fields.details')}</label>
          <Textarea id="event-details" value={form.details} onChange={(e) => { setForm((prev) => ({ ...prev, details: e.target.value })); clearFieldError('details'); }} maxLength={2000} rows={4} aria-invalid={Boolean(fieldErrors.details)} aria-describedby={fieldErrors.details ? 'event-details-error' : undefined} />
          {fieldErrors.details && <p id="event-details-error" role="alert" className="mt-1 text-xs text-destructive">{t(fieldErrors.details)}</p>}
        </div>

        <div>
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t('ui.eventPromotions.fields.duration')}</span>
          <EventPromotionAvailabilityCalendar
            vendorId={vendorId}
            startDate={form.startDate}
            endDate={form.endDate}
            onChange={(range) => { setForm((prev) => ({ ...prev, startDate: range.startDate, endDate: range.endDate })); clearFieldError('dates'); }}
          />
          {form.startDate && form.endDate && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {form.startDate === form.endDate
                ? t('ui.eventPromotions.fields.selectedSingleDay', { date: form.startDate })
                : t('ui.eventPromotions.fields.selectedRange', { start: form.startDate, end: form.endDate })}
              {dayCount(form.startDate, form.endDate) > 0 && (
                <> — {t('ui.eventPromotions.fields.costPreview', {
                  days: dayCount(form.startDate, form.endDate),
                  cost: formatMYR((dayCount(form.startDate, form.endDate) * costPerDaySen) / 100),
                })}</>
              )}
            </p>
          )}
          {fieldErrors.dates && <p role="alert" className="mt-1.5 text-xs text-destructive">{t(fieldErrors.dates)}</p>}
        </div>

        <div>
          <label htmlFor="event-image" className="mb-1 block text-xs font-semibold text-muted-foreground">{t('ui.eventPromotions.fields.image')}</label>
          {form.posterUrl ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPreviewUrl(form.posterUrl)}
                className="rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.posterUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
              </button>
              <Button type="button" variant="destructive" size="sm" onClick={removeImage}>
                <Trash2 size={14} aria-hidden="true" />
                {t('ui.eventPromotions.fields.removeImage')}
              </Button>
            </div>
          ) : (
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
              {uploading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <ImagePlus size={16} aria-hidden="true" />}
              {t('ui.eventPromotions.fields.chooseImage')}
              <input id="event-image" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void handleImageChange(e)} disabled={uploading} />
            </label>
          )}
          {fieldErrors.posterUrl && <p role="alert" className="mt-1.5 text-xs text-destructive">{t(fieldErrors.posterUrl)}</p>}
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting || uploading}>
            {submitting ? t('ui.eventPromotions.loading') : editingId ? t('ui.eventPromotions.actions.resubmit') : t('ui.eventPromotions.actions.submit')}
          </Button>
          {editingId && <Button type="button" variant="outline" onClick={cancelEdit}>{t('ui.eventPromotions.actions.cancel')}</Button>}
        </div>
      </form>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t('ui.eventPromotions.myPromotions')}</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('ui.eventPromotions.loading')}</p>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : promotions.length === 0 ? (
          <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">{t('ui.eventPromotions.empty')}</p>
        ) : (
          <ul className="space-y-3">
            {promotions.map((promotion) => (
              <li key={promotion.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{promotion.title}</p>
                    <p className="text-xs text-muted-foreground">{promotion.startDate} — {promotion.endDate}</p>
                  </div>
                  <StatusBadge status={promotion.status} />
                </div>

                {promotion.status === 'rejected' && promotion.rejectionReason && (
                  <p className="mt-2 text-xs text-destructive">{t('ui.eventPromotions.rejectionNote', { note: promotion.rejectionReason })}</p>
                )}

                {promotion.status === 'changes_requested' && (
                  <div className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
                    {promotion.changesRequestedReason && <p>{t('ui.eventPromotions.changesRequestedNote', { note: promotion.changesRequestedReason })}</p>}
                    <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => startEdit(promotion)}>
                      {t('ui.eventPromotions.actions.editAndResubmit')}
                    </Button>
                  </div>
                )}

                {promotion.status === 'approved' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="w-full text-xs text-muted-foreground">
                      {t('ui.eventPromotions.fields.costPreview', {
                        days: dayCount(promotion.startDate, promotion.endDate),
                        cost: formatMYR((dayCount(promotion.startDate, promotion.endDate) * costPerDaySen) / 100),
                      })}
                    </p>
                    <Button type="button" size="sm" disabled={payingId === promotion.id} onClick={() => void handlePay(promotion.id)}>
                      {payingId === promotion.id ? t('ui.eventPromotions.loading') : t('ui.eventPromotions.actions.pay')}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => startEdit(promotion)}>
                      {t('ui.eventPromotions.actions.modify')}
                    </Button>
                  </div>
                )}

                {promotion.status === 'paid' && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t('ui.eventPromotions.paidNote', {
                      amount: formatMYR((promotion.amountSen ?? 0) / 100),
                      method: promotion.paymentMethod === 'stripe' ? t('ui.eventPromotions.paymentMethods.stripe') : t('ui.eventPromotions.paymentMethods.wallet'),
                    })}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={Boolean(previewUrl)} onOpenChange={(open) => { if (!open) setPreviewUrl(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogTitle className="sr-only">{t('ui.eventPromotions.fields.image')}</DialogTitle>
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="w-full rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
