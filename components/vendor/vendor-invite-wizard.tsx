'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { VendorInvitePreview } from '@/lib/recommendations/vendor-invite-preview';
import { VendorInviteAccountStep } from '@/components/vendor/vendor-invite-account-step';
import { VendorInviteDetailsStep } from '@/components/vendor/vendor-invite-details-step';
import {
  createVendorInviteStoragePayload,
  draftFromVendorInvitePreview,
  mergeUntouchedVendorInviteDraft,
  restoreVendorInviteStoragePayload,
  sanitizeVendorInviteDraftForAccount,
  type VendorInviteDraft,
  type VendorInviteDraftField,
  type VendorInviteStep,
} from '@/components/vendor/vendor-invite-wizard-state';

const STORAGE_KEY = 'mywisata.vendor-invite-wizard-v2';

export type { VendorInviteDraft, VendorInviteStep } from '@/components/vendor/vendor-invite-wizard-state';

type VendorInviteWizardProps = {
  token: string;
  preview: VendorInvitePreview;
  onReload: () => Promise<void>;
};

async function fingerprintToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

type DraftState = { draft: VendorInviteDraft; dirtyFields: VendorInviteDraftField[] };

type DraftAction =
  | { type: 'replace'; state: DraftState }
  | { type: 'merge-prefill'; prefill: VendorInviteDraft; emailMatched: boolean }
  | { type: 'update'; field: VendorInviteDraftField; value: VendorInviteDraft[VendorInviteDraftField] };

function draftReducer(current: DraftState, action: DraftAction): DraftState {
  if (action.type === 'replace') return action.state;
  if (action.type === 'update') {
    return {
      draft: { ...current.draft, [action.field]: action.value },
      dirtyFields: current.dirtyFields.includes(action.field) ? current.dirtyFields : [...current.dirtyFields, action.field],
    };
  }
  const merged = mergeUntouchedVendorInviteDraft(current.draft, action.prefill, current.dirtyFields);
  return sanitizeVendorInviteDraftForAccount(merged, current.dirtyFields, action.emailMatched);
}

export function VendorInviteWizard({ token, preview, onReload }: VendorInviteWizardProps) {
  const initialDraft = useMemo(() => draftFromVendorInvitePreview(preview), [preview]);
  const [step, setStep] = useState<VendorInviteStep>('account');
  const [draftState, dispatchDraft] = useReducer(draftReducer, { draft: initialDraft, dirtyFields: [] });
  const [tokenFingerprint, setTokenFingerprint] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const initialEmailMatchedRef = useRef(preview.account.emailMatched);

  useEffect(() => {
    let active = true;
    void fingerprintToken(token).then((fingerprint) => {
      if (!active) return;
      setTokenFingerprint(fingerprint);
      try {
        const saved = restoreVendorInviteStoragePayload(window.sessionStorage.getItem(`${STORAGE_KEY}.${fingerprint}`), fingerprint);
        if (saved) {
          const sanitized = sanitizeVendorInviteDraftForAccount(saved.draft, saved.dirtyFields, initialEmailMatchedRef.current);
          dispatchDraft({ type: 'replace', state: sanitized });
          setStep(saved.step);
          if (!initialEmailMatchedRef.current) {
            window.sessionStorage.setItem(
              `${STORAGE_KEY}.${fingerprint}`,
              JSON.stringify(createVendorInviteStoragePayload(fingerprint, saved.step, sanitized.draft, sanitized.dirtyFields)),
            );
          }
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
    dispatchDraft({ type: 'merge-prefill', prefill: initialDraft, emailMatched: preview.account.emailMatched });
  }, [initialDraft, preview.account.emailMatched, restored]);

  useEffect(() => {
    if (!restored || !tokenFingerprint) return;
    const sanitized = sanitizeVendorInviteDraftForAccount(draftState.draft, draftState.dirtyFields, preview.account.emailMatched);
    window.sessionStorage.setItem(
      `${STORAGE_KEY}.${tokenFingerprint}`,
      JSON.stringify(createVendorInviteStoragePayload(tokenFingerprint, step, sanitized.draft, sanitized.dirtyFields)),
    );
  }, [draftState, preview.account.emailMatched, restored, step, tokenFingerprint]);

  function update<Field extends VendorInviteDraftField>(field: Field, value: VendorInviteDraft[Field]) {
    dispatchDraft({ type: 'update', field, value });
  }

  const activeStep = preview.account.emailMatched ? step : 'account';
  const stepNumber = activeStep === 'account' ? 1 : activeStep === 'details' ? 2 : 3;

  return (
    <section aria-label="Vendor invitation setup">
      <p className="mb-3 text-sm font-semibold text-primary">Step {stepNumber} of 3</p>
      {activeStep === 'account' && <VendorInviteAccountStep token={token} account={preview.account} onContinue={() => setStep('details')} onReload={onReload} />}
      {activeStep === 'details' && <VendorInviteDetailsStep preview={preview} draft={draftState.draft} update={update} onContinue={() => setStep('verify')} />}
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
