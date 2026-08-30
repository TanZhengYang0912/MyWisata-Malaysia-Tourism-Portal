-- Repair the chat thread contract in environments where the original
-- vendor_id/uniqueness migration was not applied. This is intentionally
-- idempotent so it is safe to run against both legacy and current schemas.

ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id);

UPDATE public.chat_threads AS t
SET vendor_id = o.vendor_id
FROM public.outlets AS o
WHERE o.id = t.outlet_id
  AND t.vendor_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_chat_thread_vendor_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT o.vendor_id
  INTO NEW.vendor_id
  FROM public.outlets AS o
  WHERE o.id = NEW.outlet_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_threads_set_vendor_id ON public.chat_threads;
CREATE TRIGGER chat_threads_set_vendor_id
  BEFORE INSERT ON public.chat_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_chat_thread_vendor_id();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.chat_threads WHERE vendor_id IS NULL) THEN
    RAISE EXCEPTION 'chat_threads contains rows without a vendor_id';
  END IF;
END
$$;

ALTER TABLE public.chat_threads
  ALTER COLUMN vendor_id SET NOT NULL;

-- Preserve the oldest conversation and move its messages before creating the
-- uniqueness guarantee required by getOrCreateThread().
WITH ranked AS (
  SELECT id,
         customer_id,
         outlet_id,
         FIRST_VALUE(id) OVER (
           PARTITION BY customer_id, outlet_id
           ORDER BY created_at ASC, id ASC
         ) AS keep_id,
         ROW_NUMBER() OVER (
           PARTITION BY customer_id, outlet_id
           ORDER BY created_at ASC, id ASC
         ) AS row_number
  FROM public.chat_threads
), duplicates AS (
  SELECT id, keep_id
  FROM ranked
  WHERE row_number > 1
)
UPDATE public.chat_messages AS m
SET thread_id = d.keep_id
FROM duplicates AS d
WHERE m.thread_id = d.id;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY customer_id, outlet_id
           ORDER BY created_at ASC, id ASC
         ) AS row_number
  FROM public.chat_threads
)
DELETE FROM public.chat_threads
WHERE id IN (SELECT id FROM ranked WHERE row_number > 1);

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_customer_outlet_unique
  ON public.chat_threads (customer_id, outlet_id);
;
