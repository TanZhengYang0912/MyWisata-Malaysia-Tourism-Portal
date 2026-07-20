-- Allow the durable email outbox to store high-priority vendor events.
ALTER TABLE public.email_outbox
  DROP CONSTRAINT IF EXISTS email_outbox_event_type_check;

ALTER TABLE public.email_outbox
  ADD CONSTRAINT email_outbox_event_type_check CHECK (event_type IN (
    'checkout_succeeded', 'topup_succeeded', 'topup_failed', 'topup_refunded',
    'withdrawal_submitted', 'withdrawal_approved', 'withdrawal_hold',
    'withdrawal_resumed', 'withdrawal_paid', 'withdrawal_failed',
    'withdrawal_rejected', 'wallet_adjustment',
    'payout_account_connected', 'payout_account_disconnected',
    'recommendation_reward_pending', 'recommendation_reward_available',
    'recommendation_reward_reversed', 'account_suspended',
    'account_unsuspended', 'account_deleted', 'account_restored',
    'vendor_order_update', 'vendor_booking_update', 'vendor_listing_review',
    'vendor_wallet_update', 'vendor_account_update',
    'vendor_permission_update'
  ));

NOTIFY pgrst, 'reload schema';
