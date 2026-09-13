-- Product-owned ticket admission policies.
-- A pass is initialised from the product inside the database so neither the
-- checkout client nor an outlet scanner can select a more permissive policy.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ticket_entry_policy TEXT NOT NULL DEFAULT 'single_entry',
  ADD COLUMN IF NOT EXISTS ticket_entry_limit INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ticket_validity_days INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_ticket_entry_policy_check') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_ticket_entry_policy_check
      CHECK (ticket_entry_policy IN ('single_entry', 'group_entry', 'multi_entry'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_ticket_entry_limit_check') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_ticket_entry_limit_check
      CHECK (ticket_entry_limit BETWEEN 1 AND 1000);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_ticket_entry_shape_check') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_ticket_entry_shape_check
      CHECK (
        (ticket_entry_policy = 'single_entry' AND ticket_entry_limit = 1 AND ticket_validity_days IS NULL)
        OR (ticket_entry_policy = 'group_entry' AND ticket_entry_limit > 1 AND ticket_validity_days IS NULL)
        OR (ticket_entry_policy = 'multi_entry' AND ticket_entry_limit > 1 AND ticket_validity_days BETWEEN 1 AND 365)
      );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.apply_product_ticket_pass_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product RECORD;
  v_quantity INTEGER;
BEGIN
  SELECT
    p.requires_booking,
    p.ticket_entry_policy,
    p.ticket_entry_limit,
    p.ticket_validity_days,
    GREATEST(1, COALESCE(oi.quantity, 1)) AS quantity
  INTO v_product
  FROM public.order_items oi
  JOIN public.products p ON p.id = oi.product_id
  WHERE oi.id = NEW.order_item_id;

  -- Preserve non-ticket rows and historical records that cannot be linked to a
  -- current product. New booking tickets always have an order item.
  IF NOT FOUND OR NOT COALESCE(v_product.requires_booking, false) THEN
    RETURN NEW;
  END IF;

  v_quantity := v_product.quantity;

  IF v_product.ticket_entry_policy = 'multi_entry' THEN
    NEW.policy := 'multi_entry';
    NEW.entry_limit := v_product.ticket_entry_limit * v_quantity;
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(
      NEW.valid_until,
      NOW() + make_interval(days => v_product.ticket_validity_days)
    );
  ELSIF v_product.ticket_entry_policy = 'group_entry' THEN
    NEW.policy := 'group_entry';
    NEW.entry_limit := v_product.ticket_entry_limit * v_quantity;
    NEW.valid_from := NULL;
    NEW.valid_until := NULL;
  ELSIF v_quantity > 1 THEN
    -- Preserve the current cart behaviour: purchasing quantity > 1 is a group
    -- pass when the product itself is configured as a one-entry ticket.
    NEW.policy := 'group_entry';
    NEW.entry_limit := v_quantity;
    NEW.valid_from := NULL;
    NEW.valid_until := NULL;
  ELSE
    NEW.policy := 'single_entry';
    NEW.entry_limit := 1;
    NEW.valid_from := NULL;
    NEW.valid_until := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_passes_apply_product_policy ON public.ticket_passes;
CREATE TRIGGER ticket_passes_apply_product_policy
  BEFORE INSERT ON public.ticket_passes
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_product_ticket_pass_policy();
