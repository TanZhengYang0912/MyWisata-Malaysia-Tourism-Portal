-- Ensure every seeded demo user has a wallet row.
-- The handle_new_auth_user trigger creates wallets for new auth signups,
-- but demo users seeded directly into public.users bypass that trigger.
INSERT INTO wallets (user_id)
SELECT id FROM users
WHERE id::text LIKE 'aaaaaaaa-%'
  AND id NOT IN (SELECT user_id FROM wallets)
ON CONFLICT DO NOTHING;
