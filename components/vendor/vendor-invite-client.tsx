'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, RefreshCw, ShieldCheck } from 'lucide-react';
import { VendorInviteWizard } from '@/components/vendor/vendor-invite-wizard';
import { buildVendorInviteSupportMailto } from '@/components/vendor/vendor-invite-wizard-state';
import type { VendorInvitePreview } from '@/lib/recommendations/vendor-invite-preview';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; preview: VendorInvitePreview }
  | { status: 'error'; message: string; retryable: boolean };

export default function VendorInviteClient({ token }: { token: string }) {
  const { t } = useTranslation('vendor');
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const loadPreview = useCallback(async () => {
    if (!token) {
      setState({ status: 'error', message: t('invite.codes.INVITE_INVALID'), retryable: false });
      return;
    }
    setState({ status: 'loading' });
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch('/api/vendor-invite/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        signal: controller.signal,
      });
      const body = await response.json() as {
        data: VendorInvitePreview | null;
        error: { code?: string; message?: string } | null;
      };
      if (!response.ok || !body.data) {
        const code = body.error?.code ?? '';
        setState({
          status: 'error',
          message: t(`invite.codes.${code}`),
          retryable: response.status >= 500,
        });
        return;
      }
      setState({ status: 'ready', preview: body.data });
    } catch {
      setState({
        status: 'error',
        message: t('invite.errors.load'),
        retryable: true,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [t, token]);

  useEffect(() => {
    void Promise.resolve().then(loadPreview);
  }, [loadPreview]);

  if (state.status === 'loading') {
    return <main className="mx-auto max-w-6xl px-4 py-12 text-sm text-muted-foreground">{t('invite.loading')}</main>;
  }

  if (state.status === 'error') {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <section className="rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-xl font-bold text-foreground">{t('invite.title')}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{state.message}</p>
          {state.retryable && (
            <button type="button" onClick={loadPreview} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">
              <RefreshCw size={15} /> {t('invite.actions.retry')}
            </button>
          )}
          <div className="mt-5 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm font-semibold text-primary">
            <a href={buildVendorInviteSupportMailto(t('invite.support.newInvitationSubject'))} className="hover:underline">{t('invite.actions.requestNew')}</a>
            <a href={buildVendorInviteSupportMailto(t('invite.support.subject'))} className="hover:underline">{t('invite.actions.contactSupport')}</a>
          </div>
        </section>
      </main>
    );
  }

  const { preview } = state;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('invite.recommendation.eyebrow')}</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">{t('invite.recommendation.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('invite.recommendation.description')}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_500px] lg:items-start">
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-bold text-foreground">{t('invite.recommendation.details')}</h2>
          <div className="mt-5 space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('invite.fields.business')}</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{preview.recommendation.businessName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('invite.fields.description')}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{preview.recommendation.description ?? t('invite.notProvided')}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('invite.recommendation.why')}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{preview.recommendation.whyRecommend ?? t('invite.notProvided')}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('invite.fields.category')}</p>
                <p className="mt-1 text-sm text-foreground">{preview.recommendation.categoryName ?? t('invite.notProvided')}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('invite.fields.contact')}</p>
                <p className="mt-1 text-sm text-foreground">{preview.maskedContact.email ?? t('invite.notProvidedEmail')}</p>
                <p className="mt-1 text-sm text-foreground">{preview.maskedContact.phone ?? t('invite.notProvidedPhone')}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('invite.fields.googleLocation')}</p>
              <p className="mt-1 flex items-start gap-2 text-sm text-foreground"><MapPin size={15} className="mt-0.5 shrink-0 text-primary" /> {preview.recommendation.formattedAddress ?? preview.recommendation.locationName ?? t('invite.notProvided')}</p>
            </div>
            {preview.recommendation.images.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {preview.recommendation.images.map((image, index) => (
                  <div key={image.id} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
                    <Image src={image.url} alt={t('invite.recommendation.photoAlt', { business: preview.recommendation.businessName, index: index + 1 })} fill unoptimized className="object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="mt-5 flex items-start gap-2 rounded-xl bg-secondary/50 px-4 py-3 text-xs leading-5 text-muted-foreground">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" /> {t('invite.recommendation.photoNotice')}
          </p>
        </section>

        <div>
          <p className="mb-3 rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3 text-sm text-foreground">
            {t('invite.recommendation.prefillNotice')}
          </p>
          <VendorInviteWizard token={token} preview={preview} onReload={loadPreview} />
        </div>
      </div>
    </main>
  );
}
