-- 20260718000000_product_attributes.sql — category-specific detail attributes
--
-- Per-category detail chips (trail difficulty, session length, room types, …)
-- are stored as a single JSONB blob rather than one column per attribute —
-- avoids a migration per category. Content/shape is owned by
-- lib/customer/category-details.ts, not by the schema.
--
-- is_hidden_gem is a badge any listing can carry, independent of category.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS attributes   JSONB   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_hidden_gem BOOLEAN NOT NULL DEFAULT FALSE;
