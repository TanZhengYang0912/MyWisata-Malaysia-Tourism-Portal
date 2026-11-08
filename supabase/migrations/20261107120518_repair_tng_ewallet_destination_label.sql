-- Restore the canonical server-controlled label on existing TNG e-wallet destinations.
UPDATE public.payout_destinations
   SET label = 'TNG eWallet'
 WHERE dest_type = 'ewallet'
   AND label IS DISTINCT FROM 'TNG eWallet';
