-- ============================================================
-- Migration 012 — Fill missing P1-owned seed data
-- (Originally 010 locally — renumbered alongside 011, see that file's header.)
-- Owner: Member 4, but the DATA below (platform_settings,
-- chatbot_kb_documents) belongs to P1's tables — this is a pure data
-- top-up, not a schema/code change to their module.
--
-- Why: live smoke-testing this session found the deployed Supabase project
-- has diverged from supabase/seed.sql — different demo users, duplicate
-- product rows, and (what this migration fixes) platform_settings and
-- chatbot_kb_documents missing rows the seed file expects. Confirmed via
-- the live app, not assumed.
--
-- Strictly additive: inserts only rows that don't already exist by key/title.
-- Never overwrites or deletes an existing row, per instruction — the live
-- data someone else configured is left exactly as-is.
--
-- Applied this session via a one-off Node script using the service-role
-- client (no direct Postgres connection string was available to run this
-- .sql file's DDL/DML directly) — see the session notes. Running this file
-- itself (e.g. `supabase db push`) is idempotent and produces the same result.
-- ============================================================

-- ⚠️ demo.mode is a SHARED flag, not P4-specific. Setting it to 'true'
-- likely also enables other members' mock buttons (mock payment success/
-- fail, mock OTP, mock KYC approval) wherever their code checks it — that
-- appears to be the flag's intended purpose for a demo project, but it's
-- not scoped to this module, so it's worth knowing before flipping it.
INSERT INTO platform_settings (key, value, description)
SELECT 'demo.mode', 'true', 'Enables mock payment/OTP/KYC buttons'
WHERE NOT EXISTS (SELECT 1 FROM platform_settings WHERE key = 'demo.mode');

-- The 5 canonical FAQ docs from supabase/seed.sql, inserted only if a row
-- with that exact title doesn't already exist (chatbot_kb_documents has no
-- unique constraint on title, so this is a manual existence check, not an
-- ON CONFLICT). The withdrawal doc's keywords already include the 'money'
-- fix from migration 009.
INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'How to earn rewards?',
       'You can earn rewards by recommending vendors or sharing affiliate links. Complete your verified profile first to unlock earning.',
       ARRAY['earn','reward','money','how'], 'rewards'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'How to earn rewards?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'How do affiliate links work?',
       'After KYC verification, generate your unique link from any vendor page. When someone books via your link within 30 days, you earn a commission.',
       ARRAY['affiliate','link','commission','share'], 'affiliate'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'How do affiliate links work?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'Withdrawal timeline?',
       'Withdrawals are reviewed by an Approver within 24-48 hours. Requests above RM500 require dual approval. Funds clear to Available after 7 days.',
       ARRAY['withdraw','payout','how long','approval','money'], 'wallet'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'Withdrawal timeline?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'How to book an activity?',
       'Browse activities, select a time slot, add to cart, and checkout. You will receive a QR code booking confirmation.',
       ARRAY['book','activity','slot','how'], 'booking'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'How to book an activity?');

INSERT INTO chatbot_kb_documents (title, body, keywords, category)
SELECT 'KYC verification?',
       'Go to Profile > Verification. Upload a government-issued ID. Our team reviews within 24-48 hours. KYC is required for withdrawals.',
       ARRAY['kyc','verify','identity','document'], 'account'
WHERE NOT EXISTS (SELECT 1 FROM chatbot_kb_documents WHERE title = 'KYC verification?');
