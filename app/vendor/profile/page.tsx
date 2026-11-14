'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, CheckCircle2, Copy, ExternalLink, Eye, Link2, Save, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import ProductMediaUploader from '@/components/vendor/product-media-uploader';
import VendorProfileGalleryManager from '@/components/vendor/vendor-profile-gallery-manager';
import AiWritingAssistant from '@/components/vendor/ai-writing-assistant';
import { BUSINESS_TYPE_OPTIONS, businessTypeLabel } from '@/lib/vendor/profile-ui';
import { vendorImageUrl } from '@/lib/storage/vendor-image';
import { VendorPageHeader } from '@/components/vendor/vendor-page-header';

type VendorProfile = {
  name: string;
  slug: string;
  description: string | null;
  business_type: string | null;
  logo_url: string | null;
  cover_url: string | null;
  status: string;
};

type ProfileForm = {
  name: string;
  slug: string;
  description: string;
  businessType: string;
  logoUrl: string;
  coverUrl: string;
};

const MAX_DESCRIPTION_LENGTH = 2000;
const FIELD_CLASS = 'mt-2 h-11 w-full rounded-xl border border-gray-200 dark:border-border bg-card px-3 text-sm text-gray-800 dark:text-foreground outline-none transition placeholder:text-gray-400 dark:placeholder:text-muted-foreground hover:border-gray-300 dark:hover:border-border focus:border-primary focus:ring-4 focus:ring-primary/10';

function formFromProfile(data: VendorProfile): ProfileForm {
  return {
    name: data.name,
    slug: data.slug,
    description: data.description || '',
    businessType: data.business_type || '',
    logoUrl: data.logo_url || '',
    coverUrl: data.cover_url || '',
  };
}

function isSameForm(left: ProfileForm, right: ProfileForm) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function ImageFallback({ label, className }: { label: string; className: string }) {
  return <div className={`flex items-center justify-center bg-muted text-center text-xs font-semibold text-primary/60 ${className}`}>{label}</div>;
}

function ProfileImage({ src, alt, fallback, className }: { src: string; alt: string; fallback: string; className: string }) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = vendorImageUrl(src);
  if (!resolvedSrc || failed) return <ImageFallback label={fallback} className={className} />;
  // Profile images can be external URLs or Supabase public URLs, so next/image cannot optimize them without changing config.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={resolvedSrc} alt={alt} className={className} onError={() => setFailed(true)} />;
}

export default function VendorProfilePage() {
  const { t } = useTranslation('vendor');
  const { user } = useAuth();
  const vendorId = user?.activeVendorId;
  const [profile, setProfile] = useState<VendorProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>({ name: '', slug: '', description: '', businessType: '', logoUrl: '', coverUrl: '' });
  const [savedForm, setSavedForm] = useState<ProfileForm>(form);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const isDirty = useMemo(() => !isSameForm(form, savedForm), [form, savedForm]);
  const publicProfileHref = vendorId ? `/guest/vendor/${vendorId}` : '#';
  const selectedBusinessTypeIsLegacy = Boolean(form.businessType && !BUSINESS_TYPE_OPTIONS.some((option) => option.value === form.businessType));

  useEffect(() => {
    if (!vendorId) return;
    fetch(`/api/vendors/${vendorId}`, { cache: 'no-store' }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t('ui.profile.loadFailed'));
      const data = payload.data as VendorProfile;
      const nextForm = formFromProfile(data);
      setProfile(data);
      setForm(nextForm);
      setSavedForm(nextForm);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : t('ui.profile.loadFailed'))).finally(() => setLoading(false));
  }, [t, vendorId]);

  function updateField<K extends keyof ProfileForm>(field: K, value: ProfileForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    setMessage(null);
    setError(null);
  }

  async function generateProfileDraft() {
    if (!vendorId) return;
    setAiBusy(true); setAiError(null); setAiDraft(null);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/ai/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surface: 'business_profile', name: form.name, businessType: form.businessType, description: form.description }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || t('ui.profile.aiUnavailable'));
      setAiDraft(payload.data?.draft || null);
    } catch (reason) {
      setAiError(reason instanceof Error ? reason.message : t('ui.profile.aiUnavailable'));
    } finally { setAiBusy(false); }
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    if (!vendorId || !isDirty) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/vendors/${vendorId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t('ui.profile.saveFailed'));
      const nextProfile = payload.data as VendorProfile;
      const nextForm = formFromProfile(nextProfile);
      setProfile(nextProfile);
      setForm(nextForm);
      setSavedForm(nextForm);
      setMessage(t('ui.profile.saved'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('ui.profile.saveFailed'));
    } finally { setSaving(false); }
  }

  async function copyPublicLink() {
    if (!vendorId || !navigator.clipboard) return;
    await navigator.clipboard.writeText(`${window.location.origin}${publicProfileHref}`);
    setMessage(t('ui.profile.profileLinkCopied'));
  }

  if (loading) return <div className="rounded-2xl bg-card p-8 text-sm text-gray-500 dark:text-muted-foreground">{t('ui.profile.loading')}</div>;

  const currentStatus = profile?.status || 'pending';
  const statusTone = currentStatus === 'approved' ? 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-200' : currentStatus === 'suspended' ? 'border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-800 dark:text-red-200' : 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200';

  return <div className="space-y-6">
    <VendorPageHeader
      eyebrow={<><Building2 size={15} aria-hidden="true" /> {t('ui.profile.vendorIdentity')}</>}
      title={t('ui.profile.title')}
      actions={<div className="flex w-full flex-col gap-2 sm:w-auto">
        {isDirty && <span className="text-xs font-semibold text-amber-700 dark:text-amber-200">{t('ui.profile.unsavedChanges')}</span>}
        <div className="grid w-full grid-cols-2 gap-2 sm:flex">
          <button type="button" onClick={() => void copyPublicLink()} disabled={!vendorId} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-border bg-card px-2 py-2.5 text-xs font-semibold text-gray-700 dark:text-foreground transition hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3.5 sm:text-sm"><Copy size={16} className="shrink-0" /> {t('ui.profile.copyProfileLink')}</button>
          <button type="submit" form="business-profile-form" disabled={saving || !isDirty} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-2 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm"><Save size={16} className="shrink-0" /> {saving ? t('ui.profile.saving') : t('ui.profile.saveChanges')}</button>
        </div>
      </div>}
    />

    {error && <div role="alert" className="max-w-5xl rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">{error}</div>}
    {message && <div role="status" className="max-w-5xl rounded-xl border border-primary/20 bg-secondary px-4 py-3 text-sm text-primary">{message}</div>}

    <form id="business-profile-form" onSubmit={(event) => void save(event)} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <section className="space-y-6 rounded-2xl border border-gray-100 dark:border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3 border-b border-gray-100 dark:border-border pb-5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><Building2 size={19} /></div><div><h2 className="text-base font-bold text-gray-950 dark:text-foreground">{t('ui.profile.businessIdentity')}</h2></div></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-semibold text-gray-700 dark:text-foreground">{t('ui.profile.businessName')}<input required value={form.name} onChange={(event) => updateField('name', event.target.value)} className={FIELD_CLASS} /></label>
            <label className="text-sm font-semibold text-gray-700 dark:text-foreground">{t('ui.profile.businessType')}<select value={form.businessType} onChange={(event) => updateField('businessType', event.target.value)} className={`${FIELD_CLASS} cursor-pointer`}><option value="">{t('ui.profile.selectBusinessType')}</option>{selectedBusinessTypeIsLegacy && <option value={form.businessType}>{t('ui.profile.currentBusinessType', { type: businessTypeLabel(form.businessType) })}</option>}{BUSINESS_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(`ui.profile.businessTypes.${option.value}`)}</option>)}</select></label>
             <div className="text-sm font-semibold text-gray-700 dark:text-foreground sm:col-span-2"><label htmlFor="vendor-profile-description">{t('ui.profile.descriptionLabel')}</label><div className="mt-3"><AiWritingAssistant draft={aiDraft} busy={aiBusy} error={aiError} onGenerate={() => void generateProfileDraft()} onApply={() => { if (aiDraft) updateField('description', aiDraft); setAiDraft(null); }} onDiscard={() => setAiDraft(null)} /></div><textarea id="vendor-profile-description" value={form.description} maxLength={MAX_DESCRIPTION_LENGTH} onChange={(event) => updateField('description', event.target.value)} rows={5} className="mt-3 w-full rounded-xl border border-gray-200 dark:border-border bg-card px-3 py-3 text-sm leading-6 text-gray-800 dark:text-foreground outline-none transition placeholder:text-gray-400 dark:placeholder:text-muted-foreground hover:border-gray-300 dark:hover:border-border focus:border-primary focus:ring-4 focus:ring-primary/10" /><span className="mt-1 block text-right text-xs font-medium text-gray-400 dark:text-muted-foreground">{form.description.length} / {MAX_DESCRIPTION_LENGTH}</span></div>
          </div>
        </section>

        <section className="space-y-6 rounded-2xl border border-gray-100 dark:border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3 border-b border-gray-100 dark:border-border pb-5"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-200"><Eye size={19} /></div><div><h2 className="text-base font-bold text-gray-950 dark:text-foreground">{t('ui.profile.brandAssets')}</h2></div></div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div><label className="text-sm font-semibold text-gray-700 dark:text-foreground">{t('ui.profile.logo')}</label><div className="mt-2 rounded-xl border border-gray-100 dark:border-border bg-gray-50/70 dark:bg-muted/70 p-3"><ProductMediaUploader vendorId={vendorId || ''} shape="square" value={vendorImageUrl(form.logoUrl)} successMessage={t('ui.profile.logoUploaded')} onUploaded={(media) => updateField('logoUrl', media.url)} onError={(uploadError) => setError(uploadError || null)} /></div><button type="button" onClick={() => updateField('logoUrl', '')} disabled={!form.logoUrl} className="mt-2 text-xs font-semibold text-gray-500 dark:text-muted-foreground underline underline-offset-4 hover:text-red-600 dark:hover:text-red-300 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50">{t('ui.profile.removeLogo')}</button></div>
            <div><label className="text-sm font-semibold text-gray-700 dark:text-foreground">{t('ui.profile.coverImage')}</label><div className="mt-2 rounded-xl border border-gray-100 dark:border-border bg-gray-50/70 dark:bg-muted/70 p-3"><ProductMediaUploader vendorId={vendorId || ''} shape="cover" value={vendorImageUrl(form.coverUrl)} successMessage={t('ui.profile.coverUploaded')} onUploaded={(media) => updateField('coverUrl', media.url)} onError={(uploadError) => setError(uploadError || null)} /></div><button type="button" onClick={() => updateField('coverUrl', '')} disabled={!form.coverUrl} className="mt-2 text-xs font-semibold text-gray-500 dark:text-muted-foreground underline underline-offset-4 hover:text-red-600 dark:hover:text-red-300 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50">{t('ui.profile.removeCover')}</button></div>
          </div>
        </section>

        <VendorProfileGalleryManager vendorId={vendorId || ''} />

        <section className="rounded-2xl border border-gray-100 dark:border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground"><Link2 size={19} /></div><div className="min-w-0 flex-1"><h2 className="text-base font-bold text-gray-950 dark:text-foreground">{t('ui.profile.publicProfileLink')}</h2><input value={form.slug} onChange={(event) => updateField('slug', event.target.value)} className={`${FIELD_CLASS} font-mono text-xs`} /><p className="mt-2 text-xs text-gray-400 dark:text-muted-foreground">{t('ui.profile.slugHelp')}</p></div></div>
        </section>

        <div className="flex justify-end border-t border-gray-100 dark:border-border pt-4">
          <button type="submit" disabled={saving || !isDirty} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"><Save size={16} /> {saving ? t('ui.profile.saving') : t('ui.profile.saveChanges')}</button>
        </div>
      </div>

      <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
        <section className="overflow-hidden rounded-2xl border border-gray-100 dark:border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-border px-5 py-4"><div><p className="text-xs font-bold text-primary">{t('ui.profile.livePreview')}</p><h2 className="mt-1 text-base font-bold text-gray-950 dark:text-foreground">{t('ui.profile.publicProfile')}</h2></div><Eye size={18} className="text-gray-400 dark:text-muted-foreground" /></div>
          <div className="relative h-36 overflow-hidden bg-secondary"><ProfileImage src={form.coverUrl} alt={t('ui.profile.coverPreviewAlt')} fallback={t('ui.profile.coverImage')} className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-gray-950/35 to-transparent" /></div>
          <div className="relative px-5 pb-5"><div className="-mt-9 flex h-16 w-16 overflow-hidden rounded-2xl border-4 border-white bg-card shadow-sm"><ProfileImage src={form.logoUrl} alt={t('ui.profile.logoPreviewAlt')} fallback={t('ui.profile.logo')} className="h-full w-full object-cover" /></div><p className="mt-4 text-[11px] font-bold text-primary">{form.businessType ? t(`ui.profile.businessTypes.${form.businessType}`) : t('ui.profile.notSelected')}</p><h3 className="mt-1 break-words text-xl font-bold tracking-tight text-gray-950 dark:text-foreground">{form.name || t('ui.profile.businessNameFallback')}</h3>{form.description && <p className="mt-3 line-clamp-4 text-sm leading-6 text-gray-500 dark:text-muted-foreground">{form.description}</p>}<a href={publicProfileHref} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline">{t('ui.profile.viewPublicProfile')} <ExternalLink size={14} /></a></div>
        </section>

        <section className={`rounded-2xl border p-5 ${statusTone}`}><div className="flex items-start gap-3"><div className="mt-0.5 rounded-full bg-card/70 p-1.5"><ShieldCheck size={17} /></div><div><div className="flex items-center gap-2"><h2 className="text-sm font-bold">{t(`ui.profile.statusLabels.${currentStatus}`)}</h2>{currentStatus === 'approved' && <CheckCircle2 size={16} />}</div><p className="mt-2 text-sm leading-6 opacity-80">{t(`ui.profile.statusDescriptions.${currentStatus}`)}</p></div></div></section>

        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-border bg-gray-50/70 dark:bg-muted/70 p-5"><p className="text-sm font-bold text-gray-800 dark:text-foreground">{t('ui.profile.updateLocation')}</p><a href="/vendor/outlets" className="mt-3 inline-flex text-sm font-bold text-primary hover:underline">{t('ui.profile.manageOutlets')} <ExternalLink size={14} className="ml-1.5" /></a></div>
      </aside>
    </form>
  </div>;
}
