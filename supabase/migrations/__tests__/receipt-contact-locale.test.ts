import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261029223809_receipt_contact_locale_precedence.sql'), 'utf8');

describe('registered alternate receipt locale migration', () => {
  it('uses a paid order snapshot only for its owner and matching contact address', () => {
    expect(sql).toContain("NEW.event_type='checkout_succeeded'");
    expect(sql).toContain("NEW.payload->>'receiptOrderId'");
    expect(sql).toContain("o.id=(NEW.payload->>'receiptOrderId')::uuid AND o.user_id=NEW.user_id");
    expect(sql).toContain('lower(btrim(o.contact_email))=lower(btrim(NEW.to_email))');
    expect(sql).toContain("o.status IN ('paid','completed')");
    expect(sql).toContain("IF NOT matched THEN chosen:='en'; END IF");
  });

  it('retains saved account preference priority and immutable sent/unknown retries', () => {
    expect(sql).toContain("IF OLD.status='sent'");
    expect(sql).toContain("coalesce(to_jsonb(OLD)->>'delivery_state','')='unknown'");
    expect(sql).toContain('u.id=NEW.user_id');
    expect(sql).toContain('lower(btrim(u.email))=lower(btrim(NEW.to_email))');
    expect(sql).toContain("OLD.payload->>'locale'");
  });
});
