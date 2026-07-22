ALTER TABLE public.email_outbox
  DROP CONSTRAINT IF EXISTS email_outbox_event_type_check;

ALTER TABLE public.email_outbox
  ADD CONSTRAINT email_outbox_event_type_check CHECK (event_type IN (
    'checkout_succeeded', 'topup_succeeded',
    'withdrawal_submitted', 'withdrawal_approved', 'withdrawal_paid',
    'withdrawal_failed', 'withdrawal_rejected',
    'account_suspended', 'account_unsuspended', 'account_deleted', 'account_restored'
  ));
