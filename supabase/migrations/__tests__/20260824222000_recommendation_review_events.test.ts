import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const path = 'supabase/migrations/20260824222000_recommendation_review_events.sql';
const sql = existsSync(path) ? readFileSync(path, 'utf8') : '';

describe('recommendation review events migration', () => {
  it('adds assignment and append-only decision evidence', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS assigned_to');
    expect(sql).toContain('CREATE TABLE public.recommendation_review_events');
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.recommendation_review_events/i);
    expect(sql).toContain('recommendation_review_events_append_only');
  });

  it('claims one pending recommendation with compare-and-set semantics', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.claim_recommendation_review');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toMatch(/assigned_to\s+IS\s+NULL/i);
    expect(sql).toContain("'canDecide'");
  });

  it('records the decision, audit, and customer notification in one RPC', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_review_recommendation');
    expect(sql).toContain('p_internal_note TEXT');
    expect(sql).toContain('p_customer_message TEXT');
    expect(sql).toContain('INSERT INTO public.recommendation_review_events');
    expect(sql).toContain('INSERT INTO public.audit_logs');
    expect(sql).toContain('INSERT INTO public.notifications');
    expect(sql).toMatch(/assigned_to\s+IS\s+DISTINCT\s+FROM\s+auth\.uid\(\)/i);
  });

  it('keeps review evidence private from browser roles', () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.recommendation_review_events FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.recommendation_review_events TO service_role/i);
  });
});
