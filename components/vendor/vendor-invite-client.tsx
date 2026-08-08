'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { MapPin, RefreshCw, ShieldCheck } from 'lucide-react';
import VendorClaimForm, { type VendorClaimValues } from '@/components/vendor/vendor-claim-form';
import type { VendorInvitePreview } from '@/lib/recommendations/vendor-invite-preview';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; preview: VendorInvitePreview }
  | { status: 'error'; message: string; retryable: boolean };

const ERROR_MESSAGES: Record<string, string> = {
  INVITE_INVALID: 'This invitation link is invalid.',
  INVITE_EXPIRED: 'This vendor invitation has expired. Request a new invitation from MyWisata.',
  INVITE_CANCELLED: 'This vendor invitation was cancelled.',
  INVITE_ALREADY_CLAIMED: 'This vendor invitation has already been claimed.',
  RECOMMENDATION_NOT_READY: 'This recommendation is not ready for vendor claim.',
};

export default function VendorInviteClient({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const loadPreview = useCallback(async () => {
    if (!token) {
      setState({ status: 'error', message: ERROR_MESSAGES.INVITE_INVALID, retryable: false });
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
          message: ERROR_MESSAGES[code] ?? body.error?.message ?? 'We couldn’t load this invitation. Please retry or request a new invitation.',
          retryable: response.status >= 500,
        });
        return;
      }
      setState({ status: 'ready', preview: body.data });
    } catch {
      setState({
        status: 'error',
        message: 'We couldn’t load this invitation. Please retry or request a new invitation.',
        retryable: true,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [token]);

  useEffect(() => {
    void Promise.resolve().then(loadPreview);
  }, [loadPreview]);

  if (state.status === 'loading') {
    return <main className="mx-auto max-w-6xl px-4 py-12 text-sm text-muted-foreground">Loading invitation…</main>;
  }

  if (state.status === 'error') {
    return (
      <main className="mx-auto max-w-xl px-4 py-12">
        <section className="rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-xl font-bold text-foreground">Vendor invitation</h1>
          <p className="mt-3 text-sm text-muted-foreground">{state.message}</p>
          {state.retryable && (
            <button type="button" onClick={loadPreview} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white">
              <RefreshCw size={15} /> Retry
            </button>
          )}
        </section>
      </main>
    );
  }

  const { preview } = state;
  const initialValues: VendorClaimValues = {
    businessName: preview.prefill.businessName,
    legalBusinessName: preview.prefill.legalBusinessName,
    businessType: preview.prefill.businessType,
    contactEmail: preview.prefill.contactEmail ?? '',
    contactPhone: preview.prefill.contactPhone ?? '',
    businessAddress: preview.prefill.businessAddress,
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Recommendation invitation</p>
        <h1 className="mt-2 text-3xl font-bold text-foreground">You’re invited to join MyWisata</h1>
        <p className="mt-2 text-sm text-muted-foreground">A MyWisata member recommended this business.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_500px] lg:items-start">
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-bold text-foreground">Recommendation details</h2>
          <div className="mt-5 space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Business</p>
              <p className="mt-1 text-lg font-semibold text-foreground">{preview.recommendation.businessName}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{preview.recommendation.description ?? 'Not provided'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why it was recommended</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-foreground">{preview.recommendation.whyRecommend ?? 'Not provided'}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</p>
                <p className="mt-1 text-sm text-foreground">{preview.recommendation.category ?? 'Not provided'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
                <p className="mt-1 text-sm text-foreground">{preview.maskedContact.email ?? 'Email not provided'}</p>
                <p className="mt-1 text-sm text-foreground">{preview.maskedContact.phone ?? 'Phone not provided'}</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Google location</p>
              <p className="mt-1 flex items-start gap-2 text-sm text-foreground"><MapPin size={15} className="mt-0.5 shrink-0 text-primary" /> {preview.recommendation.formattedAddress ?? preview.recommendation.locationName ?? 'Not provided'}</p>
            </div>
            {preview.recommendation.images.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {preview.recommendation.images.map((image, index) => (
                  <div key={image.id} className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
                    <Image src={image.url} alt={`${preview.recommendation.businessName} recommendation photo ${index + 1}`} fill unoptimized className="object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="mt-5 flex items-start gap-2 rounded-xl bg-secondary/50 px-4 py-3 text-xs leading-5 text-muted-foreground">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" /> Recommendation photos are shown for reference and are not copied to your Vendor profile.
          </p>
        </section>

        <div>
          <p className="mb-3 rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3 text-sm text-foreground">
            Pre-filled from a customer recommendation. Please review and edit any details that are incorrect.
          </p>
          <VendorClaimForm
            token={token}
            initialValues={initialValues}
            authenticated={preview.authenticated}
            emailMatched={preview.emailMatched}
            phoneVerified={preview.phoneVerified}
          />
        </div>
      </div>
    </main>
  );
}
