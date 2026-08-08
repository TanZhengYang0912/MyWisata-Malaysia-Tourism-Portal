'use client';

import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { VendorInvitePreview } from '@/lib/recommendations/vendor-invite-preview';
import { VendorInviteAccountStep } from '@/components/vendor/vendor-invite-account-step';
import { VendorInviteDetailsStep } from '@/components/vendor/vendor-invite-details-step';
import { VendorInvitePhoneStep } from '@/components/vendor/vendor-invite-phone-step';
import {
  buildGuidedVendorClaimInput,
  mapClaimError,
  readApiFailure,
  recoveryRequiresPreviewReload,
  submitGuidedVendorClaim,
} from '@/components/vendor/vendor-invite-phone-state';
import {
  createVendorInviteStoragePayload,
  draftFromVendorInvitePreview,
  reconcileVendorInvitePrefill,
  restoreVendorInviteStoragePayload,
  sanitizeVendorInviteDraftForAccount,
  type VendorInviteDraft,
  type VendorInviteDraftField,
  type VendorInviteDraftState,
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

type DraftState = VendorInviteDraftState;

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
  return reconcileVendorInvitePrefill(current, action.prefill, action.emailMatched);
}

export function VendorInviteWizard({ token, preview, onReload }: VendorInviteWizardProps) {
  const initialDraft = useMemo(() => draftFromVendorInvitePreview(preview), [preview]);
  const [step, setStep] = useState<VendorInviteStep>('account');
  const [draftState, dispatchDraft] = useReducer(draftReducer, { draft: initialDraft, dirtyFields: [] });
  const [tokenFingerprint, setTokenFingerprint] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [inactive, setInactive] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const initialEmailMatchedRef = useRef(preview.account.emailMatched);
  const initialDraftRef = useRef(initialDraft);

  useEffect(() => {
    let active = true;
    void fingerprintToken(token).then((fingerprint) => {
      if (!active) return;
      setTokenFingerprint(fingerprint);
      try {
        const saved = restoreVendorInviteStoragePayload(window.sessionStorage.getItem(`${STORAGE_KEY}.${fingerprint}`), fingerprint);
        if (saved) {
          const sanitized = reconcileVendorInvitePrefill(
            { draft: saved.draft, dirtyFields: saved.dirtyFields },
            initialDraftRef.current,
            initialEmailMatchedRef.current,
          );
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

  async function submitClaim() {
    if (submittingRef.current || !draftState.draft.authorizedToRepresent) return;
    submittingRef.current = true;
    setSubmitting(true);
    setClaimError(null);
    setRouteError(null);
    try {
      const response = await submitGuidedVendorClaim(fetch, buildGuidedVendorClaimInput(token, draftState.draft));
      if (response.status === 201) {
        const fingerprint = tokenFingerprint ?? await fingerprintToken(token);
        window.sessionStorage.removeItem(`${STORAGE_KEY}.${fingerprint}`);
        setSubmitted(true);
        return;
      }
      const recovery = mapClaimError(await readApiFailure(response));
      if (recovery.target === 'inactive') {
        setInactive(true);
      } else if (recovery.target === 'account' || recovery.target === 'details' || recovery.target === 'verify') {
        setStep(recovery.target);
        if (recovery.target === 'verify') setClaimError(recovery.message);
        else setRouteError(recovery.message);
        if (recoveryRequiresPreviewReload(recovery.target)) await onReload();
      } else {
        setClaimError(recovery.message);
      }
    } catch {
      setClaimError(mapClaimError({ code: '', status: 503 }).message);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const activeStep = preview.account.emailMatched ? step : 'account';
  const stepNumber = activeStep === 'account' ? 1 : activeStep === 'details' ? 2 : 3;

  if (submitted) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 text-center">
        <h2 className="text-xl font-bold text-foreground">Vendor application submitted</h2>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Your Vendor and first Outlet are private while MyWisata reviews the application.</p>
      </section>
    );
  }

  if (inactive) {
    return (
      <section className="rounded-2xl border border-border bg-card p-6 text-center">
        <h2 className="text-xl font-bold text-foreground">Vendor invitation inactive</h2>
        <p className="mt-3 text-sm text-muted-foreground">This vendor invitation is no longer active. Contact MyWisata support if you need help.</p>
      </section>
    );
  }

  return (
    <section aria-label="Vendor invitation setup">
      <p className="mb-3 text-sm font-semibold text-primary">Step {stepNumber} of 3</p>
      {routeError && <p role="alert" className="mb-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{routeError}</p>}
      {activeStep === 'account' && <VendorInviteAccountStep token={token} account={preview.account} onContinue={() => setStep('details')} onReload={onReload} />}
      {activeStep === 'details' && <VendorInviteDetailsStep preview={preview} draft={draftState.draft} update={update} onContinue={() => setStep('verify')} />}
      {activeStep === 'verify' && (
        <VendorInvitePhoneStep
          preview={preview}
          draft={draftState.draft}
          submitting={submitting}
          claimError={claimError}
          onBack={() => setStep('details')}
          onUpdateContactPhone={(phone) => update('contactPhone', phone)}
          onUpdateAuthorized={(authorized) => update('authorizedToRepresent', authorized)}
          onVerified={onReload}
          onSubmit={submitClaim}
        />
      )}
    </section>
  );
}
