import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(new URL('../../legacy-migrations/093_admin_recommendation_read_state.sql', import.meta.url), 'utf8');

describe('admin recommendation read-state migration', () => {
  it('stores one read timestamp per Super Admin and exposes owner-safe RPCs', () => {
    expect(migration).toContain('CREATE TABLE public.admin_recommendation_read_state');
    expect(migration).toContain('admin_user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE');
    expect(migration).toContain('ALTER TABLE public.admin_recommendation_read_state ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('CREATE POLICY admin_recommendation_read_state_owner_select');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_my_unread_recommendation_count()');
    expect(migration).toContain("status = 'pending'");
    expect(migration).toContain('created_at > v_seen_at');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.mark_my_recommendations_seen()');
    expect(migration).toContain('public.is_super_admin(auth.uid())');
    expect(migration).toContain('ON CONFLICT (admin_user_id) DO UPDATE');
  });
});
