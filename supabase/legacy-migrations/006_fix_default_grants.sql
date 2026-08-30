-- ============================================================
-- Migration 006 — Restore Supabase's default table grants
--
-- Root cause: DROP SCHEMA public CASCADE removed the ALTER DEFAULT
-- PRIVILEGES that Supabase sets up by default. After that, any tables
-- we CREATE have no grants to anon/authenticated/service_role, so
-- PostgREST returns "permission denied for table X" for every request.
-- RLS was a red herring — this is a plain PostgreSQL privilege issue.
--
-- Fix: grant table/function/sequence access to the standard Supabase
-- roles, and set default privileges so future tables inherit them.
-- ============================================================

-- Schema-level (usage on public + auth for RLS auth.uid())
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Grant on all EXISTING tables in public
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO authenticated, service_role;
GRANT SELECT                                          ON ALL TABLES    IN SCHEMA public TO anon;

-- Grant on sequences (for SERIAL / gen_random_uuid() etc)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Grant on functions (for RPCs)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Default privileges for FUTURE tables/sequences/functions created by postgres
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Ensure the auth trigger's target tables also work when trigger runs
-- (trigger runs as its DEFINER which is postgres, so this is mostly belt-and-braces)
GRANT INSERT, UPDATE ON users, wallets, user_roles TO service_role;
