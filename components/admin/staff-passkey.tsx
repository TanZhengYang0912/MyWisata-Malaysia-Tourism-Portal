"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { runStaffPasskey, type StaffPasskeyRequest } from '@/lib/auth/staff-passkey-browser';

type Device = { id: string; label: string };
type Props = {
  embedded?: boolean;
  operation?: 'login' | 'approve' | 'retry-payout' | 'fraud-override';
  withdrawalId?: string; expectedVersion?: string; payload?: Record<string, unknown>;
  disabled?: boolean; onBusyChange?: (busy: boolean) => void;
  onVerified: (proofId: string | null) => void | Promise<void>;
};

export function StaffPasskey({ operation = 'login', withdrawalId, expectedVersion, payload, disabled = false, onBusyChange, onVerified, embedded = false }: Props) {
  const router = useRouter();
  const { t } = useTranslation('admin');
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(operation === 'login');
  const [passwordAuthenticated, setPasswordAuthenticated] = useState(true);
  const [busy, setBusy] = useState(false);
  const [grant, setGrant] = useState('');
  const [label, setLabel] = useState('');
  // Store message keys, not translated text, so a language switch re-renders them.
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [manage, setManage] = useState(false);
  const financial = operation !== 'login';

  function displayError(reason: unknown) {
    const code = reason instanceof Error ? reason.message : '';
    const key = code === 'STAFF_PASSKEY_ENROLLMENT_REQUIRED' ? 'enrollmentRequired'
      : code === 'STAFF_PASSWORD_REQUIRED' ? 'passwordRequired'
      : code === 'STAFF_PASSKEY_RATE_LIMITED' ? 'rateLimited'
      : code === 'STAFF_PASSKEY_UNSUPPORTED' ? 'unsupported'
      : code === 'STAFF_PASSKEY_RETRY_REQUIRED' ? 'retryRequired'
      : code === 'STAFF_PASSKEY_UNAVAILABLE' ? 'unavailable' : 'failed';
    setError(key);
  }

  async function loadDevices() {
    const response = await fetch('/api/auth/staff-passkey/credentials', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok || !body.data) throw new Error(body.error?.code ?? 'STAFF_PASSKEY_UNAVAILABLE');
    setDevices(body.data.credentials);
    setPasswordAuthenticated(body.data.passwordAuthenticated === true);
  }

  useEffect(() => {
    if (financial) return;
    let active = true;
    void fetch('/api/auth/staff-passkey/credentials', { cache: 'no-store' }).then(async response => {
      const body = await response.json();
      if (!active) return;
      if (!response.ok || !body.data) throw new Error(body.error?.code ?? 'STAFF_PASSKEY_UNAVAILABLE');
      setDevices(body.data.credentials);
      setPasswordAuthenticated(body.data.passwordAuthenticated === true);
    }).catch(reason => { if (active) { setPasswordAuthenticated(false); displayError(reason); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // The verification screen owns this single initial credential fetch.
  }, [financial]);

  async function perform(input: StaffPasskeyRequest, done?: (proofId: string | null) => void | Promise<void>) {
    if (busy || disabled) return;
    setBusy(true); onBusyChange?.(true); setError(''); setMessage('');
    try {
      const result = await runStaffPasskey(input);
      await done?.(result.proofId);
    } catch (reason) { displayError(reason); }
    finally { setBusy(false); onBusyChange?.(false); }
  }

  async function register() {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const code = grant.trim();
      // An enrollment code replaces the fresh-passkey check server-side, so a
      // new device on an account that already has passkeys can still enroll.
      if (devices.length && !code) await runStaffPasskey({ operation: 'manage' });
      await runStaffPasskey({ operation: 'register', label: label.trim() || t('passkey.defaultDevice'), ...(code ? { grant: code } : {}) });
      setGrant(''); setLabel(''); await loadDevices(); setMessage('registered');
    } catch (reason) { displayError(reason); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await runStaffPasskey({ operation: 'manage' });
      const response = await fetch('/api/auth/staff-passkey/credentials', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credentialId: id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.code ?? 'STAFF_PASSKEY_FAILED');
      await loadDevices();
    } catch (reason) { displayError(reason); }
    finally { setBusy(false); }
  }

  async function passwordLogin() {
    const { error: signOutError } = await createClient().auth.signOut({ scope: 'local' });
    if (signOutError) { setError('failed'); return; }
    router.push('/login');
  }

  const verifyButton = <Button type="button" disabled={busy || disabled || loading || (!financial && (!passwordAuthenticated || devices.length === 0))} onClick={() => void perform({ operation, ...(financial ? { withdrawalId, expectedVersion, payload } : {}) }, onVerified)} className={embedded ? 'h-12 w-full gap-2 rounded-xl text-sm font-semibold shadow-sm sm:text-base' : 'gap-2'}><ShieldCheck size={16} />{t(busy ? 'passkey.working' : financial ? 'passkey.verifyAndConfirm' : 'passkey.verify')}</Button>;
  if (financial) return <div className="space-y-2">{error && <p role="alert" className="text-sm text-destructive">{t(`passkey.${error}`)}</p>}{verifyButton}</div>;

  return <section className={embedded ? 'space-y-4' : 'space-y-4 rounded-2xl border border-border bg-card p-6'}>
    {!embedded && <p className="text-sm text-muted-foreground">{t('passkey.description')}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{t(`passkey.${error}`)}</p>}
    {message && <p role="status" className="text-sm text-nature-green-ink">{t(`passkey.${message}`)}</p>}
    {!passwordAuthenticated && <p className="text-sm text-muted-foreground">{t('passkey.passwordRequired')}</p>}
    {verifyButton}
    {!loading && passwordAuthenticated && (devices.length === 0 || manage) && <div className="space-y-3 border-t border-border pt-4">
      <p className="text-sm text-muted-foreground">{t(devices.length === 0 ? 'passkey.enrollmentRequired' : 'passkey.grantHint')}</p>
      <label className="block text-sm font-medium" htmlFor="staff-passkey-grant">{t('passkey.grantLabel')}</label>
      <Input id="staff-passkey-grant" type="password" autoComplete="off" value={grant} onChange={event => setGrant(event.target.value)} disabled={busy} />
      <label className="block text-sm font-medium" htmlFor="staff-passkey-label">{t('passkey.deviceLabel')}</label>
      <Input id="staff-passkey-label" maxLength={80} value={label} onChange={event => setLabel(event.target.value)} disabled={busy} />
      <Button type="button" variant="outline" disabled={busy || (devices.length === 0 && !grant.trim())} onClick={() => void register()}>{t('passkey.register')}</Button>
      {devices.map(device => <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="min-w-0 flex-1 break-words">{device.label}</span><Button type="button" variant="outline" disabled={busy || devices.length <= 1} onClick={() => void revoke(device.id)}>{t('passkey.remove')}</Button></div>)}
      <p className="text-xs text-muted-foreground">{t('passkey.recovery')}</p>
    </div>}
    <div className="flex flex-wrap gap-2">{devices.length > 0 && <Button type="button" variant="outline" disabled={busy} onClick={() => setManage(!manage)}>{t('passkey.manage')}</Button>}<Button type="button" variant="ghost" disabled={busy} onClick={() => void passwordLogin()}>{t('passkey.passwordLogin')}</Button></div>
  </section>;
}
