import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261114051117_support_chatbot_recommendation_snapshots.sql', 'utf8');

describe('Support Bot recommendation snapshot migration', () => {
  it('keeps recommendation snapshots bounded and attached to the atomic bot-answer transaction', () => {
    expect(migration).toMatch(/ADD COLUMN recommendation_data jsonb/i);
    expect(migration).toMatch(/pg_column_size\(recommendation_data\) <= 8192/i);
    expect(migration).toMatch(/jsonb_array_length\(v_products\) > 3/i);
    expect(migration).toMatch(/complete_chatbot_ask_operation_with_evidence\(/i);
    expect(migration).toMatch(/UPDATE public\.chatbot_messages[\s\S]*SET recommendation_data = p_recommendation_data/i);
  });

  it('keeps the snapshot writer service-role-only and uses a fixed search path', () => {
    expect(migration).toMatch(/SECURITY INVOKER[\s\S]*SET search_path = ''/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.complete_chatbot_ask_operation_with_recommendations[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.complete_chatbot_ask_operation_with_recommendations[\s\S]*TO service_role/i);
  });
});
