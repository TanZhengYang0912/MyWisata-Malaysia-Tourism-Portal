'use client';

import { useEffect, useMemo, useState } from 'react';
import type { VendorInvitePreview } from '@/lib/recommendations/vendor-invite-preview';
import { VendorInviteAccountStep } from '@/components/vendor/vendor-invite-account-step';
import { VendorInviteDetailsStep } from '@/components/vendor/vendor-invite-details-step';

const STORAGE_KEY = 'mywisata.vendor-invite-wizard-v2';

export type VendorInviteStep = 'account' | 'details' | 'verify';

export type VendorInviteDraft = {
  businessName: string;
  legalBusinessName: string;
  description: string;
  categoryId: string;
  outletName: string;
  contactEmail: string;
  contactPhone: string;
  businessAddress: string;
  latitude: number | null;
  longitude: number | null;
  authorizedToRepresent: boolean;
};

type DraftField = keyof VendorInviteDraft;

type StoredDraft = {
  version: 2;
  tokenFingerprint: string;
  step: VendorInviteStep;
  draft: VendorInviteDraft;
  dirtyFields: DraftField[];
};

type VendorInviteWizardProps = {
  token: string;
  preview: VendorInvitePreview;
  onReload: () => Promise<void>;
};

function draftFromPreview(preview: VendorInvitePreview): VendorInviteDraft {
  return {
    businessName: preview.prefill.businessName,
    legalBusinessName: preview.prefill.legalBusinessName,
    description: preview.prefill.description,
    categoryId: preview.prefill.categoryId,
    outletName: preview.prefill.outletName,
    contactEmail: preview.prefill.contactEmail ?? '',
    contactPhone: preview.prefill.contactPhone ?? '',
    businessAddress: preview.prefill.businessAddress,
    latitude: preview.prefill.latitude,
    longitude: preview.prefill.longitude,
    authorizedToRepresent: false,
  };
}

async function fingerprintToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isStoredDraft(value: unknown): value is StoredDraft {
  if (!value || typeof value !== 'object') return false;
  const saved = value as Partial<StoredDraft>;
  return saved.version === 2
    && typeof saved.tokenFingerprint === 'string'
    && (saved.step === 'account' || saved.step === 'details' || saved.step === 'verify')
    && Boolean(saved.draft)
    && Array.isArray(saved.dirtyFields);
}

export function VendorInviteWizard({ token, preview, onReload }: VendorInviteWizardProps) {
  const initialDraft = useMemo(() => draftFromPreview(preview), [preview]);
  const [step, setStep] = useState<VendorInviteStep>('account');
  const [draft, setDraft] = useState<VendorInviteDraft>(initialDraft);
  const [dirtyFields, setDirtyFields] = useState<DraftField[]>([]);
  const [tokenFingerprint, setTokenFingerprint] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    let active = true;
    void fingerprintToken(token).then((fingerprint) => {
      if (!active) return;
      setTokenFingerprint(fingerprint);
      try {
        const raw = window.sessionStorage.getItem(`${STORAGE_KEY}.${fingerprint}`);
        const saved = raw ? JSON.parse(raw) as unknown : null;
        if (isStoredDraft(saved) && saved.tokenFingerprint === fingerprint) {
          setDraft(saved.draft);
          setDirtyFields(saved.dirtyFields);
          setStep(saved.step);
        }
      } catch {
        window.sessionStorage.removeItem(`${STORAGE_KEY}.${fingerprint}`);
      } finally {
        if (active) setRestored(true);
      }
    }).catch(() => {
      if (active) setRestored(true);
    });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(() => {
      setDraft((current) => {
        const next = { ...current };
        (Object.keys(initialDraft) as DraftField[]).forEach((field) => {
          if (!dirtyFields.includes(field)) Object.assign(next, { [field]: initialDraft[field] });
        });
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dirtyFields, initialDraft, restored]);

  useEffect(() => {
    if (!restored || !tokenFingerprint) return;
    const saved: StoredDraft = { version: 2, tokenFingerprint, step, draft, dirtyFields };
    window.sessionStorage.setItem(`${STORAGE_KEY}.${tokenFingerprint}`, JSON.stringify(saved));
  }, [dirtyFields, draft, restored, step, tokenFingerprint]);

  function update<Field extends DraftField>(field: Field, value: VendorInviteDraft[Field]) {
    setDraft((current) => ({ ...current, [field]: value }));
    setDirtyFields((current) => current.includes(field) ? current : [...current, field]);
  }

  const activeStep = preview.account.emailMatched ? step : 'account';
  const stepNumber = activeStep === 'account' ? 1 : activeStep === 'details' ? 2 : 3;

  return (
    <section aria-label="Vendor invitation setup">
      <p className="mb-3 text-sm font-semibold text-primary">Step {stepNumber} of 3</p>
      {activeStep === 'account' && <VendorInviteAccountStep token={token} account={preview.account} onContinue={() => setStep('details')} onReload={onReload} />}
      {activeStep === 'details' && <VendorInviteDetailsStep preview={preview} draft={draft} update={update} onContinue={() => setStep('verify')} />}
      {activeStep === 'verify' && (
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-bold text-foreground">Verify and submit</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Phone verification and application submission are the next step.</p>
          <button type="button" onClick={() => setStep('details')} className="mt-5 text-sm font-semibold text-primary hover:underline">Back to details</button>
        </section>
      )}
    </section>
  );
}
