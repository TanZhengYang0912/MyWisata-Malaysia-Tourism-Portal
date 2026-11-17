import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261116193730_drop_account_language_preference.sql'),
  'utf8',
);

const functionBody = (name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  expect(start, `${name} should be replaced`).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf('$function$;', start));
};

const replaced = [
  'app_private.queue_order_receipt',
  'app_private.queue_catalogue_review_notices',
  'app_private.queue_recommendation_review_mail',
  'app_private.queue_withdrawal_customer_email',
  'public.queue_guest_order_access',
  'public.guest_prepare_checkout',
  'public.guest_prepare_event_checkout',
  'app_private.deliver_withdrawal_approver_notifications',
  'app_private.withdrawal_approver_recipients',
];

describe('drop account language preference migration', () => {
  it('replaces every mail and checkout reader without a locale read or payload key', () => {
    for (const name of replaced) {
      const body = functionBody(name);
      expect(body, name).not.toMatch(/preferred_locale|contact_locale|guest_email_locale|'locale'/);
      expect(body, name).toContain('SECURITY DEFINER');
    }
  });

  it('keeps each replaced signature and search_path', () => {
    expect(sql).toContain('app_private.queue_order_receipt(p_order_id uuid, p_request_hour bigint DEFAULT NULL::bigint)\n RETURNS boolean');
    expect(sql).toContain("public.queue_guest_order_access(p_order_id uuid, p_event_key text, p_reason text DEFAULT NULL::text)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'extensions', 'pg_temp'");
    expect(sql).toContain("app_private.withdrawal_approver_recipients(p_customer uuid, p_after uuid)\n RETURNS jsonb\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO ''");
    expect(sql).not.toMatch(/DROP FUNCTION[^;]*(queue_|guest_prepare|withdrawal_approver|deliver_withdrawal)/);
    expect(sql).not.toMatch(/\b(GRANT|REVOKE)\b/);
  });

  it('keeps the weather reader output columns with a NULL language', () => {
    const body = functionBody('app_private.read_trip_weather_reminder_page');
    expect(body).toContain('preferred_locale text, scheduled_date date');
    expect(body).toContain('NULL::text, days.scheduled_date');
    expect(body).not.toContain('u.preferred_locale');
  });

  it('drops the locale triggers, functions, columns and Auth metadata key', () => {
    for (const [trigger, table] of [
      ['initialize_profile_email_locale', 'public.users'],
      ['project_auth_email_locale', 'public.users'],
      ['snapshot_order_email_locale', 'public.orders'],
      ['snapshot_recipient_email_locale', 'public.email_outbox'],
    ]) {
      expect(sql).toContain(`DROP TRIGGER IF EXISTS ${trigger} ON ${table};`);
      expect(sql).toContain(`DROP FUNCTION IF EXISTS app_private.${trigger}();`);
    }
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.set_my_preferred_locale(text);');
    expect(sql).toContain('DROP FUNCTION IF EXISTS app_private.normalize_email_locale(text);');
    expect(sql).toContain('ALTER TABLE public.users DROP COLUMN IF EXISTS preferred_locale;');
    expect(sql).toContain('ALTER TABLE public.orders DROP COLUMN IF EXISTS contact_locale;');
    expect(sql).toContain("SET raw_user_meta_data = raw_user_meta_data - 'preferred_locale'");
    // Drop helpers only after the triggers that call them are gone.
    expect(sql.indexOf('DROP FUNCTION IF EXISTS app_private.normalize_email_locale')).toBeGreaterThan(
      sql.indexOf('DROP TRIGGER IF EXISTS snapshot_recipient_email_locale'),
    );
  });
});
