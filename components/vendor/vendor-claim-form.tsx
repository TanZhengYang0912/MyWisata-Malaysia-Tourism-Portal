'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';

export type VendorClaimValues = {
  businessName: string;
  legalBusinessName: string;
  businessType: string;
  contactEmail: string;
  contactPhone: string;
  businessAddress: string;
};

type VendorClaimFormProps = {
  token: string;
  initialValues?: VendorClaimValues;
  authenticated?: boolean;
  emailMatched?: boolean;
  phoneVerified?: boolean;
};

const STORAGE_KEY = 'mywisata.vendor-invite-draft';
const EMPTY_VALUES: VendorClaimValues = {
  businessName: '', legalBusinessName: '', businessType: '',
  contactEmail: '', contactPhone: '', businessAddress: '',
};

export default function VendorClaimForm({
  token,
  initialValues = EMPTY_VALUES,
  authenticated = true,
  emailMatched = true,
  phoneVerified = true,
}: VendorClaimFormProps) {
  const router = useRouter();
  const { t } = useTranslation('vendor');
  const [form, setForm] = useState<VendorClaimValues>(initialValues);
  const [dirtyFields, setDirtyFields] = useState<Array<keyof VendorClaimValues>>([]);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        const saved = raw ? JSON.parse(raw) as { token?: string; values?: VendorClaimValues; dirtyFields?: Array<keyof VendorClaimValues> } : null;
        if (saved?.token === token && saved.values) {
          setForm(saved.values);
          setDirtyFields(saved.dirtyFields ?? []);
        }
      } catch {
        window.sessionStorage.removeItem(STORAGE_KEY);
      } finally {
        setRestored(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [token]);

  useEffect(() => {
    if (!restored) return;
    const timer = window.setTimeout(() => {
      setForm((current) => {
        const next = { ...current };
        (Object.keys(initialValues) as Array<keyof VendorClaimValues>).forEach((field) => {
          if (!dirtyFields.includes(field) && initialValues[field]) next[field] = initialValues[field];
        });
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [dirtyFields, initialValues, restored]);

  useEffect(() => {
    if (!restored || submitted) return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, values: form, dirtyFields }));
  }, [dirtyFields, form, restored, submitted, token]);

  function update(field: keyof VendorClaimValues, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setDirtyFields((current) => current.includes(field) ? current : [...current, field]);
    setError(null);
  }

  function loginHref() {
    const next = `/vendor-invite?recommendation=${encodeURIComponent(token)}`;
    return `/login?next=${encodeURIComponent(next)}`;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!authenticated) {
      router.push(loginHref());
      return;
    }
    if (!emailMatched) {
      setError(t('claim.errors.emailMismatch'));
      return;
    }
    if (!phoneVerified) {
      setError(t('claim.errors.phoneVerificationRequired'));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/vendor/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...form }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body?.error?.code === 'PHONE_VERIFICATION_REQUIRED'
          ? t('claim.errors.phoneVerificationRequired')
          : body?.error?.message ?? t('claim.errors.submitFailed'));
        return;
      }
      window.sessionStorage.removeItem(STORAGE_KEY);
      setSubmitted(true);
      router.refresh();
    } catch {
      setError(t('claim.errors.network'));
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/[0.05] p-6">
        <h2 className="text-lg font-bold text-foreground">{t('claim.submitted.title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('claim.submitted.description')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('claim.invitation')}</p>
        <h2 className="mt-2 text-2xl font-bold text-foreground">{t('claim.title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('claim.description')}</p>
      </div>

      <label className="block text-sm font-semibold text-foreground">{t('claim.fields.businessName')} *<input required value={form.businessName} onChange={(event) => update('businessName', event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal" /></label>
      <label className="block text-sm font-semibold text-foreground">{t('claim.fields.legalBusinessName')} *<input required value={form.legalBusinessName} onChange={(event) => update('legalBusinessName', event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal" /></label>
      <label className="block text-sm font-semibold text-foreground">{t('claim.fields.businessType')} *<input required value={form.businessType} onChange={(event) => update('businessType', event.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-foreground">{t('claim.fields.contactEmail')} *<input required type="email" value={form.contactEmail} onChange={(event) => update('contactEmail', event.target.value)} placeholder={authenticated && emailMatched ? 'vendor@example.com' : t('claim.availableAfterSignIn')} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal" /></label>
        <label className="block text-sm font-semibold text-foreground">{t('claim.fields.contactPhone')} *<input required value={form.contactPhone} onChange={(event) => update('contactPhone', event.target.value)} placeholder={authenticated && emailMatched ? '+60…' : t('claim.availableAfterSignIn')} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal" /></label>
      </div>
      <label className="block text-sm font-semibold text-foreground">{t('claim.fields.businessAddress')} *<textarea required value={form.businessAddress} onChange={(event) => update('businessAddress', event.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 font-normal" /></label>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
        {busy ? t('claim.savingDraft') : authenticated ? t('claim.submit') : t('claim.signInToContinue')}
      </button>
    </form>
  );
}
