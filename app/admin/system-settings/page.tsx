"use client";

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, BellOff, CheckCircle2, Mail, ShoppingBag, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AdminConfirmDialog } from '@/components/admin/confirm-dialog';
import { AdminPageHeader, AdminPageShell } from '@/components/admin/admin-page-shell';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useTranslation } from 'react-i18next';

type Settings = { pauseNewOrders: boolean; pauseCustomDelivery: boolean; updatedAt: string | null; updatedBy: string | null };
const INITIAL: Settings = { pauseNewOrders: false, pauseCustomDelivery: false, updatedAt: null, updatedBy: null };

function sameValues(a: Settings, b: Settings) {
  return a.pauseNewOrders === b.pauseNewOrders && a.pauseCustomDelivery === b.pauseCustomDelivery;
}

export default function SystemSettingsPage() {
  const { t } = useTranslation('admin');
  const { showFeedback } = useActionFeedback();
  const [settings, setSettings] = useState(INITIAL);
  const [saved, setSaved] = useState(INITIAL);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetch('/api/admin/system-settings', { cache: 'no-store' });
      const body = await response.json() as { data?: Settings; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? t('ui.systemSettings.errors.load'));
      setSettings(body.data);
      setSaved(body.data);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : t('ui.systemSettings.errors.load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const dirty = !sameValues(settings, saved);
  const changedToPaused = (!saved.pauseNewOrders && settings.pauseNewOrders)
    || (!saved.pauseCustomDelivery && settings.pauseCustomDelivery);

  function requestSave() {
    setError('');
    if (!dirty) return;
    if (reason.trim().length < 10) { setError(t('ui.systemSettings.errors.reason')); return; }
    setConfirmOpen(true);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/system-settings', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pauseNewOrders: settings.pauseNewOrders, pauseCustomDelivery: settings.pauseCustomDelivery, reason: reason.trim() }),
      });
      const body = await response.json() as { data?: Settings; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? t('ui.systemSettings.errors.save'));
      setSettings(body.data);
      setSaved(body.data);
      setReason('');
      setConfirmOpen(false);
      showFeedback('success', t('ui.systemSettings.saved'));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : t('ui.systemSettings.errors.save');
      setError(message);
      showFeedback('error', message);
    } finally {
      setSaving(false);
    }
  }

  const updatedLabel = saved.updatedAt
    ? t('ui.systemSettings.updated', { date: new Date(saved.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur' }), by: saved.updatedBy || t('ui.systemSettings.unknownActor') })
    : t('ui.systemSettings.neverUpdated');

  return <AdminPageShell>
    <AdminPageHeader eyebrow={<span className="inline-flex items-center gap-2"><ShieldCheck size={14} /> {t('ui.systemSettings.eyebrow')}</span>} title={t('ui.systemSettings.title')} actions={<span role="status" className="text-xs text-muted-foreground">{updatedLabel}</span>} />
    {error && <p role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle size={16} />{error}</p>}
    {loading ? <p className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">{t('ui.systemSettings.loading')}</p>
      : loadError ? <div role="alert" className="rounded-2xl border border-destructive/30 bg-card p-8 text-center"><AlertCircle size={22} className="mx-auto text-destructive" /><p className="mt-3 text-sm text-destructive">{loadError}</p><Button className="mt-4" variant="outline" onClick={() => void load()}>{t('ui.systemSettings.retry')}</Button></div>
        : <div className="grid gap-5">
          <section className="space-y-5">
            <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              {dirty && <div className="mb-3 flex justify-end"><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{t('ui.systemSettings.unsaved')}</span></div>}
              <div className="space-y-3">
                <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-background p-4 hover:bg-secondary/30">
                  <span className="flex gap-3"><ShoppingBag size={19} className="mt-0.5 shrink-0 text-primary" /><span><span className="block text-sm font-semibold text-foreground">{t('ui.systemSettings.orders.title')}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{t('ui.systemSettings.orders.description')}</span><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${settings.pauseNewOrders ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200' : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200'}`}>{t(settings.pauseNewOrders ? 'ui.systemSettings.paused' : 'ui.systemSettings.active')}</span></span></span>
                  <input aria-label={t('ui.systemSettings.orders.title')} role="switch" type="checkbox" checked={settings.pauseNewOrders} onChange={(event) => setSettings((current) => ({ ...current, pauseNewOrders: event.target.checked }))} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
                </label>
                <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border bg-background p-4 hover:bg-secondary/30">
                  <span className="flex gap-3"><Mail size={19} className="mt-0.5 shrink-0 text-primary" /><span><span className="block text-sm font-semibold text-foreground">{t('ui.systemSettings.email.title')}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{t('ui.systemSettings.email.description')}</span><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${settings.pauseCustomDelivery ? 'bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-200' : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-200'}`}>{t(settings.pauseCustomDelivery ? 'ui.systemSettings.paused' : 'ui.systemSettings.active')}</span></span></span>
                  <input aria-label={t('ui.systemSettings.email.title')} role="switch" type="checkbox" checked={settings.pauseCustomDelivery} onChange={(event) => setSettings((current) => ({ ...current, pauseCustomDelivery: event.target.checked }))} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
                </label>
              </div>
              <div className="mt-5 rounded-xl border border-primary/15 bg-secondary/40 p-4 text-sm leading-6 text-muted-foreground"><p className="flex gap-2"><CheckCircle2 size={16} className="mt-1 shrink-0 text-primary" />{t('ui.systemSettings.orders.existing')}</p><p className="mt-2 flex gap-2"><BellOff size={16} className="mt-1 shrink-0 text-primary" />{t('ui.systemSettings.email.authExemption')}</p></div>
              <label className="mt-5 block text-sm"><span className="mb-1.5 block font-medium text-foreground">{t('ui.systemSettings.reasonLabel')}</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} placeholder={t('ui.systemSettings.reasonPlaceholder')} className="w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /><span className="mt-1 block text-right text-xs text-muted-foreground">{reason.length}/500</span><span className="mt-2 block text-xs text-muted-foreground">{t('ui.systemSettings.impact.audit')}</span></label>
              <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={!dirty || saving} onClick={() => { setSettings(saved); setReason(''); setError(''); }}>{t('ui.actions.discardChanges')}</Button><Button disabled={!dirty || saving} onClick={requestSave}>{t('ui.actions.saveSettings')}</Button></div>
            </div>
          </section>
        </div>}
    <AdminConfirmDialog open={confirmOpen} title={t('ui.systemSettings.confirm.title')} description={t(changedToPaused ? 'ui.systemSettings.confirm.pauseDescription' : 'ui.systemSettings.confirm.resumeDescription')} confirmLabel={t('ui.actions.saveSettings')} confirmVariant={changedToPaused ? 'destructive' : 'default'} busy={saving} onCancel={() => setConfirmOpen(false)} onConfirm={() => void save()} />
  </AdminPageShell>;
}
