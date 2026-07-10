'use client';
// Member 3 (Trust & Money Flow) — TMF-4 Withdrawal Governance
// Client-side wrapper: button + modal + form + submit.
//
// Server-side already handles:
//   - Zod validation (schemas.ts withdrawalSubmitSchema)
//   - Idempotency-Key dedup (idempotency.ts)
//   - KYC gate + balance lock (submit_withdrawal RPC in migration 002)
//   - Audit + notification (recordAudit)
// This component only handles UX: input, client-side pre-validate, submit,
// error/success feedback, and router.refresh() to update the server-rendered
// balance / ledger / withdrawal list.
//
// TODO(future):
//   - Fetch withdrawal.high_value_rm from platform_settings instead of hardcoding 500
//   - Add payout_destinations picker (currently sends destinationId: null)

import { useState, useMemo, useId } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { apiPost, friendlyError } from '@/lib/api-client';
import { toRM, roundRM } from '@/lib/money';
import { withdrawalSubmitSchema } from '@/lib/validation/schemas';

const HIGH_VALUE_THRESHOLD = 500;
const MIN_WITHDRAWAL = 10;

interface Props {
  available: number;   // RM
}

interface WithdrawResponse {
  request_id: string;
  requires_dual_approval: boolean;
  new_available_balance: number;
}

export function WithdrawFormButton({ available }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amountStr, setAmountStr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const inputId = useId();

  // Fresh idempotency key per modal open (retries within one modal share it)
  const idempotencyKey = useMemo(() => (open ? crypto.randomUUID() : ''), [open]);

  const parsedAmount = amountStr === '' ? NaN : Number(amountStr);
  const amount = Number.isFinite(parsedAmount) ? roundRM(parsedAmount) : NaN;

  const isValidAmount = Number.isFinite(amount) && amount >= MIN_WITHDRAWAL;
  const exceedsBalance = Number.isFinite(amount) && amount > available;
  const requiresDual = Number.isFinite(amount) && amount >= HIGH_VALUE_THRESHOLD;
  const canSubmit = isValidAmount && !exceedsBalance && !submitting;

  function reset() {
    setAmountStr('');
    setFieldError(null);
    setSubmitting(false);
  }

  function handleClose() {
    if (submitting) return;
    setOpen(false);
    // Reset after transition to avoid flash of empty state
    setTimeout(reset, 200);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(null);

    // Client-side Zod parse (matches server exactly)
    const parseResult = withdrawalSubmitSchema.safeParse({ amount });
    if (!parseResult.success) {
      setFieldError(parseResult.error.errors[0]?.message ?? 'Invalid amount');
      return;
    }
    if (exceedsBalance) {
      setFieldError(`Only ${toRM(available)} available.`);
      return;
    }

    setSubmitting(true);
    const res = await apiPost<WithdrawResponse>(
      '/api/wallet/withdraw',
      { amount },
      { idempotencyKey },
    );

    if (res.error) {
      const msg = friendlyError(res.error.code, res.error.message);
      toast.error(msg);
      // Show field-level for balance/validation, keep modal open
      if (res.error.code === 'INSUFFICIENT_BALANCE') setFieldError(msg);
      setSubmitting(false);
      return;
    }

    toast.success(
      `Withdrawal ${toRM(amount)} submitted${res.data.requires_dual_approval ? ' — dual approval required' : ''}.`,
    );
    setOpen(false);
    setTimeout(reset, 200);
    router.refresh();   // re-renders server component with fresh balance + list
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full border border-gray-300 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
      >
        Request Withdrawal
      </button>

      <Modal
        open={open}
        onClose={handleClose}
        title="Request Withdrawal"
        dismissable={!submitting}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 mb-1">
              Amount (RM)
            </label>
            <input
              id={inputId}
              type="number"
              inputMode="decimal"
              step="0.01"
              min={MIN_WITHDRAWAL}
              max={available}
              value={amountStr}
              onChange={(e) => {
                setAmountStr(e.target.value);
                setFieldError(null);
              }}
              placeholder={`Minimum ${toRM(MIN_WITHDRAWAL)}`}
              autoFocus
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                fieldError ? 'border-red-400' : 'border-gray-300'
              }`}
            />
            <p className="text-xs text-gray-500 mt-1">
              Available: <span className="font-medium text-gray-700">{toRM(available)}</span>
            </p>
            {fieldError && <p className="text-xs text-red-600 mt-1">{fieldError}</p>}
          </div>

          {requiresDual && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Dual approval required</p>
                <p className="opacity-80">
                  Amounts over {toRM(HIGH_VALUE_THRESHOLD)} require two approvers.
                </p>
              </div>
            </div>
          )}

          <div className="text-xs text-gray-500 border-t border-gray-100 pt-3">
            <p>Funds are reserved immediately. Withdrawal is completed after admin approval.</p>
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} loading={submitting}>
              Confirm
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
