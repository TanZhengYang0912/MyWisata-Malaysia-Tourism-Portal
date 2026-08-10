-- ============================================================
-- Migration — repair chatbot_kb_documents rows that were saved with an
-- unfilled AI-draft placeholder still in the body.
--
-- BACKGROUND: lib/chatbot/kb-draft.ts deliberately makes Gemini emit
-- "[ADMIN: confirm <what's needed>]" instead of inventing a fact the KB
-- can't support (see that file's line 37 — it's the drafting feature's
-- integrity rule). The admin is expected to replace the placeholder before
-- saving. Nothing enforces that, so a Save with the placeholder left in
-- ships it straight to customers as the bot's answer.
--
-- That happened to the live "How do I become a vendor?" entry, which served
-- "[ADMIN: confirm typical review turnaround time]" to customers from
-- 2026-08-01 until it was repaired by hand.
--
-- WHY THIS FILE EXISTS SEPARATELY from 20260810000000_kb_payment_vendor_topics.sql:
-- that migration only INSERTs, guarded by WHERE NOT EXISTS on the title.
-- On any database that already holds the broken row (as the live project
-- did), the insert is correctly skipped — and the broken text stays. An
-- UPDATE is the only thing that repairs an existing row, so it lives here.
--
-- Both statements below are idempotent and safe to re-run: each is
-- conditioned on the placeholder marker still being present, so an already
-- repaired database is a no-op.
-- ============================================================

-- 1. The one entry whose correct text is known.
--
-- Conditioned on the marker rather than on an exact body match: the
-- original row contained curly apostrophes and em dashes, so matching the
-- whole string exactly would be fragile across encodings. Keying on
-- "[ADMIN:" also means a row someone has since rewritten properly is left
-- alone rather than being overwritten with this version.
--
-- embedding/embedded_at are cleared so the corrected text is re-embedded —
-- the reindex route (POST /api/admin/chatbot/reindex) treats a null
-- embedded_at as stale and will pick it up. Until then the doc still
-- answers via the keyword fallback path, so it is never unreachable.
UPDATE chatbot_kb_documents
SET body = 'Sign in and go to your Profile, then select "Become a Vendor" (/customer/profile/register-vendor). Fill in your business application - business name, description, business type, and contact details - and submit it. Your application goes to the MyWisata team for review; you can keep setting things up privately while it is pending, but nothing is visible to travellers yet. Once approved, you will get access to the vendor dashboard to set up your outlet, add products, upload photos, and configure booking time slots.',
    embedding = NULL,
    embedded_at = NULL
WHERE title = 'How do I become a vendor?'
  AND body LIKE '%[ADMIN:%';

-- 2. Safety net for any OTHER row with the same defect.
--
-- Deliberately deactivates rather than edits: this migration cannot know
-- the correct answer for an arbitrary entry, and a wrong invented answer
-- would be worse than none. Deactivating stops the chatbot serving a
-- half-written answer while leaving the row fully intact and visible in
-- /admin/chatbot, where it shows as inactive so an admin can finish it and
-- reactivate it.
--
-- Nothing is deleted, and an already-inactive row is untouched.
--
-- On the live project as of this migration this matches zero rows — it is
-- here for other environments and for any future recurrence, not to fix a
-- known case.
UPDATE chatbot_kb_documents
SET is_active = FALSE
WHERE is_active = TRUE
  AND body LIKE '%[ADMIN:%';
