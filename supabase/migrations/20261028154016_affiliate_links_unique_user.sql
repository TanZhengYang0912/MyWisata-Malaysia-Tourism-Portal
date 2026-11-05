-- affiliate_links is one row per user. Refuse to hide historical duplicates:
-- the owner records must be reviewed explicitly before the invariant is added.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.affiliate_links
    GROUP BY user_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce affiliate link uniqueness while duplicate user rows exist';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_links_user_id_unique
  ON public.affiliate_links (user_id);
