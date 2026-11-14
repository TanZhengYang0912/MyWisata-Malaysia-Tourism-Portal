'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Check, Clock3, ImageIcon, ImagePlus, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { EventPromotionAvailabilityCalendar } from '@/components/vendor/event-promotion-availability-calendar';
import { formatDate, formatMYR } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';
import { VendorPageHeader } from '@/components/vendor/vendor-page-header';
import { EVENT_PROMOTION_LIMITS } from '@/lib/validation/vendor-schemas';
import styles from './page.module.css';

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
type FormField = keyof FormState;
type FieldErrors = Partial<Record<FormField, string>>;

const EMPTY_FORM: FormState = { title: '', details: '', startDate: '', endDate: '', posterUrl: '' };
const FORM_ID = 'event-promotion-form';
const TITLE_MAX = EVENT_PROMOTION_LIMITS.titleMax;
const DETAILS_MAX = EVENT_PROMOTION_LIMITS.detailsMax;
const FORM_FIELDS: FormField[] = ['title', 'details', 'startDate', 'endDate', 'posterUrl'];

function isFormField(value: string): value is FormField {
  return (FORM_FIELDS as string[]).includes(value);
}
const POSTER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function dayCount(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  const days = Math.round((end - start) / 86_400_000) + 1;
  return days > 0 ? days : 0;
}

export default function VendorEventPromotionsPage() {
  const { t, i18n } = useTranslation('vendor');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { user } = useAuth();
  const { showFeedback } = useActionFeedback();
  const vendorId = user?.activeVendorId;

  const [promotions, setPromotions] = useState<EventPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [costPerDaySen, setCostPerDaySen] = useState(10_000);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false);

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
    setFieldErrors({});
    setHasTriedSubmit(false);
  }

  // Same rules as eventPromotionSubmitSchema, so a submit the server would
  // reject with 422 is stopped here with a message on the field itself.
  function validateForm(values: FormState): FieldErrors {
    const errors: FieldErrors = {};
    const title = values.title.trim();
    const details = values.details.trim();
    if (title.length < EVENT_PROMOTION_LIMITS.titleMin) errors.title = t('ui.eventPromotions.errors.titleTooShort', { min: EVENT_PROMOTION_LIMITS.titleMin });
    if (details.length < EVENT_PROMOTION_LIMITS.detailsMin) errors.details = t('ui.eventPromotions.errors.detailsTooShort', { min: EVENT_PROMOTION_LIMITS.detailsMin });
    if (!values.startDate) errors.startDate = t('ui.eventPromotions.errors.datesRequired');
    else if (!values.endDate) errors.endDate = t('ui.eventPromotions.errors.datesRequired');
    else if (values.endDate < values.startDate) errors.endDate = t('ui.eventPromotions.errors.endBeforeStart');
    if (!values.posterUrl) errors.posterUrl = t('ui.eventPromotions.imageRequired');
    return errors;
  }

  function updateField(field: FormField, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  // Click-to-choose and drag-and-drop share this single upload request.
  async function uploadPoster(file: File) {
    if (!vendorId || uploading) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`/api/vendors/${vendorId}/event-promotions/upload`, { method: 'POST', body: formData });
      const body = await response.json() as { data?: { url?: string }; error?: { message?: string } };
      if (!response.ok || !body.data?.url) throw new Error(body.error?.message ?? t('ui.eventPromotions.uploadError'));
      updateField('posterUrl', body.data.url);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : t('ui.eventPromotions.uploadError'));
    } finally {
      setUploading(false);
    }
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void uploadPoster(file);
  }

  function handlePosterDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    // The server validates the type too; this only skips an upload that cannot succeed.
    if (!POSTER_TYPES.includes(file.type)) {
      showFeedback('error', t('ui.eventPromotions.uploadError'));
      return;
    }
    void uploadPoster(file);
  }

  function removeImage() {
    setForm((prev) => ({ ...prev, posterUrl: '' }));
  }

  // The API returns zod's flatten() shape on 422: { fieldErrors: { title: [...] } }.
  function readServerFieldErrors(details: unknown): FieldErrors {
    if (!details || typeof details !== 'object' || !('fieldErrors' in details)) return {};
    const raw = (details as { fieldErrors?: unknown }).fieldErrors;
    if (!raw || typeof raw !== 'object') return {};
    const errors: FieldErrors = {};
    for (const [key, messages] of Object.entries(raw as Record<string, unknown>)) {
      if (!isFormField(key) || !Array.isArray(messages) || messages.length === 0) continue;
      errors[key] = t('ui.eventPromotions.errors.fieldRejected');
    }
    return errors;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!vendorId || submitting) return;
    setHasTriedSubmit(true);
    const clientErrors = validateForm(form);
    setFieldErrors(clientErrors);
    if (Object.keys(clientErrors).length > 0) {
      const firstField = FORM_FIELDS.find((field) => clientErrors[field]);
      const targetId = firstField === 'title' ? 'event-title' : firstField === 'details' ? 'event-details' : firstField === 'posterUrl' ? 'event-image' : null;
      if (targetId) document.getElementById(targetId)?.focus();
      showFeedback('error', t('ui.eventPromotions.errors.fixFields'));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        details: form.details.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        posterUrl: form.posterUrl,
      };
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
      // A proxy or crash page can return HTML; treat an unreadable body as a generic failure.
      const body = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string; details?: unknown } };
      if (!response.ok) {
        if (response.status === 422) {
          const serverErrors = readServerFieldErrors(body.error?.details);
          if (Object.keys(serverErrors).length > 0) {
            setFieldErrors(serverErrors);
            showFeedback('error', t('ui.eventPromotions.errors.fixFields'));
            return;
          }
        }
        throw new Error(body.error?.message ?? t('ui.eventPromotions.submitError'));
      }
      showFeedback('success', editingId ? t('ui.eventPromotions.resubmitSuccess') : t('ui.eventPromotions.submitSuccess'));
      setFieldErrors({});
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

  const formatDay = (iso: string) => formatDate(`${iso}T00:00:00Z`, locale, { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
  const formatRange = (start: string, end: string) => (start === end ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`);

  const days = dayCount(form.startDate, form.endDate);
  const totalLabel = formatMYR((days * costPerDaySen) / 100);
  const isEventReady = form.title.trim().length >= EVENT_PROMOTION_LIMITS.titleMin && form.details.trim().length >= EVENT_PROMOTION_LIMITS.detailsMin;
  const isDatesReady = days > 0;
  const isPosterReady = Boolean(form.posterUrl);
  const isReady = isEventReady && isDatesReady && isPosterReady;
  // Keep Submit enabled until the first attempt so the vendor gets field-level
  // reasons instead of a silently disabled button.
  const isSubmitDisabled = submitting || uploading || (hasTriedSubmit && !isReady);
  const fieldError = (field: FormField) => fieldErrors[field] ?? null;
  const dateError = fieldError('startDate') ?? fieldError('endDate');
  const submitLabel = submitting ? t('ui.eventPromotions.loading') : editingId ? t('ui.eventPromotions.actions.resubmit') : t('ui.eventPromotions.actions.submit');
  const dayCountLabel = t('ui.eventPromotions.dayCount', { count: days });

  const checklist = [
    { key: 'event', label: t('ui.eventPromotions.checkEvent'), done: isEventReady },
    { key: 'dates', label: t('ui.eventPromotions.checkDates'), done: isDatesReady },
    { key: 'poster', label: t('ui.eventPromotions.posterHeading'), done: isPosterReady },
  ];

  const sectionStatus = (done: boolean, label: string) => done && (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
      <Check size={14} aria-hidden="true" />{label}
    </span>
  );

  const submitIcon = submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />;

  return (
    <div className="w-full space-y-6 pb-28 xl:pb-8">
      <VendorPageHeader
        title={t('ui.eventPromotions.title')}
        titleClassName="text-3xl sm:text-4xl"
        // Wrapped so the header's full-width mobile action rule stretches the wrapper, not the pill.
        actions={<div><span className="inline-flex items-center rounded-full bg-secondary px-3 py-1.5 text-sm font-bold tabular-nums text-primary">{t('ui.eventPromotions.ratePerDay', { rate: formatMYR(costPerDaySen / 100) })}</span></div>}
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22.5rem] xl:gap-6">
        <form id={FORM_ID} onSubmit={handleSubmit} noValidate className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {editingId && (
            <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary/50 px-5 py-2.5 sm:px-7">
              <p className="text-sm font-semibold text-primary">{t('ui.eventPromotions.editHeading')}</p>
              <Button type="button" variant="outline" size="sm" onClick={cancelEdit}>{t('ui.eventPromotions.actions.cancel')}</Button>
            </div>
          )}

          <section aria-labelledby="promotion-event-heading" className="px-5 py-6 sm:px-7">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 id="promotion-event-heading" className="text-lg font-bold text-foreground">{t('ui.eventPromotions.eventHeading')}</h2>
              {sectionStatus(isEventReady, t('ui.eventPromotions.sectionDone'))}
            </div>
            <div className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <label htmlFor="event-title" className="text-sm font-semibold text-foreground">{t('ui.eventPromotions.fields.title')}</label>
                  <span className={`text-xs tabular-nums ${form.title.length > TITLE_MAX - 20 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>{t('ui.eventPromotions.charCount', { count: form.title.length, max: TITLE_MAX })}</span>
                </div>
                <Input id="event-title" className="h-12 rounded-xl border-primary/20 bg-card hover:border-primary/40" placeholder={t('ui.eventPromotions.titlePlaceholder')} value={form.title} onChange={(e) => updateField('title', e.target.value)} maxLength={TITLE_MAX} minLength={EVENT_PROMOTION_LIMITS.titleMin} aria-invalid={Boolean(fieldError('title'))} aria-describedby={fieldError('title') ? 'event-title-error' : undefined} required />
                {fieldError('title') && <p id="event-title-error" role="alert" className="mt-1.5 text-xs font-medium text-destructive">{fieldError('title')}</p>}
              </div>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <label htmlFor="event-details" className="text-sm font-semibold text-foreground">{t('ui.eventPromotions.fields.details')}</label>
                  <span className={`text-xs tabular-nums ${form.details.length > DETAILS_MAX - 200 ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>{t('ui.eventPromotions.charCount', { count: form.details.length, max: DETAILS_MAX })}</span>
                </div>
                <Textarea id="event-details" className="min-h-28 rounded-xl border-primary/20 bg-card hover:border-primary/40" placeholder={t('ui.eventPromotions.detailsPlaceholder')} value={form.details} onChange={(e) => updateField('details', e.target.value)} maxLength={DETAILS_MAX} minLength={EVENT_PROMOTION_LIMITS.detailsMin} aria-invalid={Boolean(fieldError('details'))} aria-describedby={fieldError('details') ? 'event-details-error' : undefined} rows={4} required />
                {fieldError('details') && <p id="event-details-error" role="alert" className="mt-1.5 text-xs font-medium text-destructive">{fieldError('details')}</p>}
              </div>
            </div>
          </section>

          <section aria-labelledby="promotion-dates-heading" className="border-t border-border px-5 py-6 sm:px-7">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 id="promotion-dates-heading" className="text-lg font-bold text-foreground">{t('ui.eventPromotions.datesHeading')}</h2>
              {sectionStatus(isDatesReady, dayCountLabel)}
            </div>
            <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
              <div className={styles.calendar}>
                <EventPromotionAvailabilityCalendar
                  vendorId={vendorId}
                  startDate={form.startDate}
                  endDate={form.endDate}
                  onChange={(range) => {
                    setForm((prev) => ({ ...prev, startDate: range.startDate, endDate: range.endDate }));
                    setFieldErrors((prev) => ({ ...prev, startDate: undefined, endDate: undefined }));
                  }}
                  onCostPerDayChange={setCostPerDaySen}
                />
              </div>
              <div className="space-y-3">
                <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-1" aria-live="polite">
                  {[
                    { key: 'start', label: t('ui.eventPromotions.startDate'), value: form.startDate, isNext: !form.startDate },
                    { key: 'end', label: t('ui.eventPromotions.endDate'), value: form.endDate, isNext: false },
                  ].map((item) => (
                    <div key={item.key} className={`rounded-xl border px-3.5 py-2.5 ${item.isNext ? 'border-primary ring-3 ring-primary/15' : 'border-border'}`}>
                      <dt className="text-xs font-semibold text-muted-foreground">{item.label}</dt>
                      <dd className={`text-[15px] ${item.value ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{item.value ? formatDay(item.value) : t('ui.eventPromotions.pickDate')}</dd>
                    </div>
                  ))}
                </dl>
                {dateError && <p role="alert" className="text-xs font-medium text-destructive">{dateError}</p>}
                <p className="text-sm text-muted-foreground">{t('ui.eventPromotions.availabilityNote')}</p>
              </div>
            </div>
          </section>

          <section aria-labelledby="promotion-poster-heading" className="border-t border-border px-5 py-6 sm:px-7">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 id="promotion-poster-heading" className="text-lg font-bold text-foreground">{t('ui.eventPromotions.posterHeading')}</h2>
              {sectionStatus(isPosterReady, t('ui.eventPromotions.sectionAdded'))}
            </div>
            <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
              <div
                onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handlePosterDrop}
                className={`relative aspect-[4/3] w-full overflow-hidden rounded-2xl border-[1.5px] transition-colors ${isPosterReady ? 'border-solid border-border bg-secondary/60' : isDragging ? 'border-dashed border-primary bg-secondary' : 'border-dashed border-primary/25 bg-muted hover:border-primary hover:bg-secondary'} focus-within:ring-2 focus-within:ring-primary`}
              >
                {isPosterReady && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.posterUrl} alt="" className="absolute inset-0 size-full object-contain" />
                )}
                <input
                  id="event-image"
                  type="file"
                  accept={POSTER_TYPES.join(',')}
                  aria-label={isPosterReady ? t('ui.eventPromotions.replaceImage') : t('ui.eventPromotions.dropPoster')}
                  className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
                  onChange={handleImageChange}
                  disabled={uploading}
                />
                {!isPosterReady && (
                  <div className="pointer-events-none absolute inset-0 grid place-content-center justify-items-center gap-2 p-4 text-center">
                    <span className="grid size-12 place-items-center rounded-xl bg-card text-primary shadow-sm"><ImagePlus size={22} aria-hidden="true" /></span>
                    <span className="text-sm font-semibold text-foreground">{t('ui.eventPromotions.dropPoster')}</span>
                    <span className="text-xs text-muted-foreground">{t('ui.eventPromotions.posterFormats')}</span>
                  </div>
                )}
                {uploading && (
                  <div className="absolute inset-0 grid place-items-center bg-card/75 text-sm font-semibold text-foreground" role="status">
                    <span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={16} aria-hidden="true" />{t('ui.eventPromotions.uploading')}</span>
                  </div>
                )}
              </div>
              {fieldError('posterUrl') && !isPosterReady && <p role="alert" className="text-xs font-medium text-destructive sm:col-span-2">{fieldError('posterUrl')}</p>}
              {isPosterReady && (
                <div className="flex flex-wrap gap-2">
                  <label htmlFor="event-image" className="inline-flex min-h-10 grow cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-secondary sm:grow-0">
                    <RefreshCw size={15} aria-hidden="true" />{t('ui.eventPromotions.replaceImage')}
                  </label>
                  <Button type="button" variant="ghost" className="h-10 grow text-destructive hover:bg-destructive/10 hover:text-destructive sm:grow-0" onClick={removeImage}>
                    <Trash2 size={15} aria-hidden="true" />{t('ui.eventPromotions.fields.removeImage')}
                  </Button>
                </div>
              )}
            </div>
          </section>
        </form>

        <aside className="min-w-0 space-y-5 xl:sticky xl:top-6 xl:self-start">
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm" aria-labelledby="submission-summary-title">
            <div className="flex items-center justify-between gap-3 px-5 pt-5">
              <h2 id="submission-summary-title" className="text-lg font-bold text-foreground">{t('ui.eventPromotions.summaryHeading')}</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"><Clock3 size={14} aria-hidden="true" />{editingId ? t('ui.eventPromotions.editHeading') : t('ui.eventPromotions.draft')}</span>
            </div>

            <div className="px-5 pt-4">
              <div className="overflow-hidden rounded-2xl border border-border">
                <div className="relative aspect-[4/3] bg-secondary/60">
                  {isPosterReady ? (
                    <button type="button" onClick={() => setPreviewUrl(form.posterUrl)} aria-label={t('ui.eventPromotions.previewImage')} className="absolute inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.posterUrl} alt="" className="size-full object-contain" />
                    </button>
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-muted-foreground/70"><ImageIcon size={28} aria-hidden="true" /></div>
                  )}
                  <span className="pointer-events-none absolute left-3 top-3 rounded-md bg-highlight-yellow px-2 py-0.5 text-[11px] font-extrabold text-highlight-yellow-foreground">{t('ui.eventPromotions.previewTag')}</span>
                </div>
                <div className="px-4 py-3">
                  <p className={`break-words text-[15px] font-bold leading-snug ${form.title.trim() ? 'text-foreground' : 'font-medium text-muted-foreground'}`}>{form.title.trim() || t('ui.eventPromotions.fields.title')}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarDays size={14} aria-hidden="true" className="shrink-0" />{isDatesReady ? formatRange(form.startDate, form.endDate) : t('ui.eventPromotions.datesHeading')}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t('ui.eventPromotions.previewCaption')}</p>
            </div>

            <ul className="space-y-2 px-5 pt-4 text-sm">
              {checklist.map((item) => (
                <li key={item.key} className={`flex items-center gap-2 ${item.done ? 'text-foreground' : 'text-muted-foreground'}`}>
                  <span className={`grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors ${item.done ? 'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-400 dark:bg-emerald-400 dark:text-emerald-950' : 'border-primary/25'}`}>
                    {item.done && <Check size={12} strokeWidth={3} aria-hidden="true" />}
                  </span>
                  {item.label}
                  <span className="sr-only">{item.done ? t('ui.eventPromotions.sectionDone') : ''}</span>
                </li>
              ))}
            </ul>

            <dl className="mx-5 mt-4 space-y-1.5 border-t border-border pt-4 text-sm tabular-nums">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t('ui.eventPromotions.rate')}</dt><dd className="font-semibold text-foreground">{t('ui.eventPromotions.ratePerDay', { rate: formatMYR(costPerDaySen / 100) })}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t('ui.eventPromotions.days')}</dt><dd className="font-semibold text-foreground">{days ? `× ${days}` : '—'}</dd></div>
              <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-dashed border-primary/20 pt-3"><dt className="font-bold text-foreground">{t('ui.eventPromotions.estimatedTotal')}</dt><dd className="text-2xl font-extrabold tracking-tight text-foreground">{totalLabel}</dd></div>
            </dl>

            <div className="space-y-2 px-5 pb-5 pt-4">
              <Button type="submit" form={FORM_ID} size="lg" className="hidden min-h-12 w-full rounded-xl xl:inline-flex" disabled={isSubmitDisabled}>{submitIcon}{submitLabel}</Button>
              <p className="text-center text-xs text-muted-foreground">{t('ui.eventPromotions.finalAmountNote')}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm" aria-labelledby="my-promotions-title">
            <h2 id="my-promotions-title" className="mb-4 text-lg font-bold text-foreground">{t('ui.eventPromotions.myPromotions')}</h2>
            {loading ? (
              <p className="text-sm text-muted-foreground">{t('ui.eventPromotions.loading')}</p>
            ) : error ? (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            ) : promotions.length === 0 ? (
              <p className="rounded-xl bg-secondary/50 p-5 text-center text-sm text-muted-foreground">{t('ui.eventPromotions.empty')}</p>
            ) : (
              <ul className="space-y-3">
                {promotions.map((promotion) => (
                  <li key={promotion.id} className="rounded-xl border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-foreground">{promotion.title}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">{formatRange(promotion.startDate, promotion.endDate)}</p>
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
        </aside>
      </div>

      {/* Below xl the summary sits after the form, so total + Submit stay reachable here. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-3 shadow-[0_-8px_20px_-16px_rgba(1,0,102,0.35)] backdrop-blur-sm supports-[backdrop-filter]:bg-card/85 sm:px-6 lg:left-60 xl:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 leading-tight">
            <p className="text-xs text-muted-foreground">{t('ui.eventPromotions.estimatedTotal')}</p>
            <p className="text-lg font-extrabold tabular-nums text-foreground">{totalLabel}</p>
          </div>
          <Button type="submit" form={FORM_ID} className="ml-auto min-h-11 rounded-xl px-4" disabled={isSubmitDisabled}>{submitIcon}{submitLabel}</Button>
        </div>
      </div>

      <Dialog open={Boolean(previewUrl)} onOpenChange={(open) => { if (!open) setPreviewUrl(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogTitle className="sr-only">{t('ui.eventPromotions.posterHeading')}</DialogTitle>
          {previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="" className="w-full rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
