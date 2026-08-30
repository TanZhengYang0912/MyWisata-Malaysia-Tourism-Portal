# Supabase test support

Files in this directory are explicit local/staging helpers. Supabase migration
discovery does not execute them, and they must never be applied to production.

## Demo Purchase

Prerequisites:

- a disposable local database or isolated staging Supabase project;
- no production users, orders, notifications, payout credentials, or live email;
- `MYWISATA_DEMO_TOOLS=true` in the application runtime;
- `MYWISATA_ENV=staging` for a non-Vercel staging build, or `VERCEL_ENV=preview`
  for a Vercel preview deployment.

Install explicitly after canonical migrations:

```sh
psql "$DEMO_DATABASE_URL" --set=ON_ERROR_STOP=1 \
  --file supabase/test-support/demo-purchase.sql
```

The helper writes a mock `paid` order and order item without contacting a real
payment provider. The application API then exercises Affiliate attribution and
Vendor notification behavior. Do not use production credentials or data.
