-- Scheduled customer campaigns backed by existing, approved catalogue offers.
-- Promotion campaigns never replace voucher claims, booking, checkout, or My Activity.

-- Older vendor product writes still use products.outlet_id/base_price. Keep those
-- records connected to the canonical per-outlet offer relation consumed by
-- customer outlet pages, voucher eligibility, and campaign source selection.
CREATE OR REPLACE FUNCTION public.sync_product_outlet_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.outlet_id IS NOT NULL
     AND OLD.outlet_id IS DISTINCT FROM NEW.outlet_id THEN
    DELETE FROM public.outlet_offers
     WHERE product_id = OLD.id AND outlet_id = OLD.outlet_id;
  END IF;

  IF NEW.outlet_id IS NOT NULL THEN
    INSERT INTO public.outlet_offers (product_id, outlet_id, price, status)
    VALUES (NEW.id, NEW.outlet_id, NEW.base_price, 'active')
    ON CONFLICT (product_id, outlet_id) DO UPDATE
      SET price = EXCLUDED.price, updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_product_outlet_offer() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_sync_product_outlet_offer ON public.products;
CREATE TRIGGER trg_sync_product_outlet_offer
  AFTER INSERT OR UPDATE OF outlet_id, base_price ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_outlet_offer();

CREATE TABLE IF NOT EXISTS public.promotion_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  description TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'paused', 'archived')),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT promotion_campaigns_slug_format CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT promotion_campaigns_title_length CHECK (char_length(btrim(title)) BETWEEN 3 AND 120),
  CONSTRAINT promotion_campaigns_summary_length CHECK (char_length(btrim(summary)) BETWEEN 10 AND 240),
  CONSTRAINT promotion_campaigns_description_length CHECK (char_length(btrim(description)) BETWEEN 10 AND 5000),
  CONSTRAINT promotion_campaigns_date_range CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS promotion_campaigns_public_window_idx
  ON public.promotion_campaigns (status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS promotion_campaigns_created_by_idx
  ON public.promotion_campaigns (created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS public.promotion_campaign_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.promotion_campaigns(id) ON DELETE CASCADE,
  voucher_id UUID REFERENCES public.vouchers(id) ON DELETE RESTRICT,
  product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
  outlet_id UUID REFERENCES public.outlets(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 99),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT promotion_campaign_offers_one_source CHECK (num_nonnulls(voucher_id, product_id) = 1),
  CONSTRAINT promotion_campaign_offers_product_outlet CHECK ((product_id IS NULL) = (outlet_id IS NULL)),
  CONSTRAINT promotion_campaign_offers_position_unique UNIQUE (campaign_id, position),
  CONSTRAINT promotion_campaign_offers_source_unique UNIQUE NULLS NOT DISTINCT (campaign_id, voucher_id, product_id, outlet_id),
  CONSTRAINT promotion_campaign_offers_outlet_relationship
    FOREIGN KEY (product_id, outlet_id)
    REFERENCES public.outlet_offers (product_id, outlet_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS promotion_campaign_offers_voucher_idx
  ON public.promotion_campaign_offers (voucher_id) WHERE voucher_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS promotion_campaign_offers_product_outlet_idx
  ON public.promotion_campaign_offers (product_id, outlet_id) WHERE product_id IS NOT NULL;

ALTER TABLE public.promotion_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_campaign_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotion_campaigns_admin_select ON public.promotion_campaigns;
CREATE POLICY promotion_campaigns_admin_select ON public.promotion_campaigns
  FOR SELECT TO authenticated
  USING (public.has_staff_permission(auth.uid(), 'admin.promotion_campaign.manage'));

DROP POLICY IF EXISTS promotion_campaign_offers_admin_select ON public.promotion_campaign_offers;
CREATE POLICY promotion_campaign_offers_admin_select ON public.promotion_campaign_offers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.promotion_campaigns AS campaign
       WHERE campaign.id = promotion_campaign_offers.campaign_id
    )
    AND public.has_staff_permission(auth.uid(), 'admin.promotion_campaign.manage')
  );

REVOKE ALL ON TABLE public.promotion_campaigns FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.promotion_campaign_offers FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.promotion_campaigns, public.promotion_campaign_offers TO authenticated, service_role;

INSERT INTO public.staff_permissions (key, module, action, description, is_system)
VALUES (
  'admin.promotion_campaign.manage', 'admin', 'promotion_campaign.manage',
  'Create and govern customer promotion campaigns', TRUE
)
ON CONFLICT (key) DO UPDATE SET
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  is_system = TRUE;

INSERT INTO public.staff_modules (
  key, label, label_key, description, section_key, section_label,
  section_label_key, section_sort_order, href, icon_key, sort_order, is_system
)
VALUES (
  'promotion_campaigns', 'Promotion Campaigns', 'navigation.Promotion Campaigns',
  'Manage scheduled customer campaigns and their eligible offers',
  'governance', 'Governance', 'navigationSections.governance', 20,
  '/admin/promotion-campaigns', 'megaphone', 35, TRUE
)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  label_key = EXCLUDED.label_key,
  description = EXCLUDED.description,
  section_key = EXCLUDED.section_key,
  section_label = EXCLUDED.section_label,
  section_label_key = EXCLUDED.section_label_key,
  section_sort_order = EXCLUDED.section_sort_order,
  href = EXCLUDED.href,
  icon_key = EXCLUDED.icon_key,
  sort_order = EXCLUDED.sort_order,
  is_system = TRUE,
  updated_at = now();

INSERT INTO public.staff_module_permissions (module_id, permission_id)
SELECT module_row.id, permission.id
  FROM public.staff_modules AS module_row
  JOIN public.staff_permissions AS permission
    ON permission.key = 'admin.promotion_campaign.manage'
 WHERE module_row.key = 'promotion_campaigns'
ON CONFLICT (module_id, permission_id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.staff_roles
     WHERE name = 'Promotion Campaign Manager' AND is_system IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'promotion_campaign_manager_role_name_conflict';
  END IF;
END;
$$;

INSERT INTO public.staff_roles (name, description, is_system, is_active, created_by)
VALUES (
  'Promotion Campaign Manager',
  'Template for staff who create and review customer promotion campaigns',
  TRUE, TRUE, NULL
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  is_system = TRUE,
  is_active = TRUE,
  updated_at = now();

DELETE FROM public.staff_role_permissions AS role_permission
 USING public.staff_roles AS staff_role, public.staff_permissions AS permission
 WHERE role_permission.role_id = staff_role.id
   AND role_permission.permission_id = permission.id
   AND staff_role.name = 'Promotion Campaign Manager'
   AND staff_role.is_system IS TRUE
   AND permission.key <> 'admin.promotion_campaign.manage';

DELETE FROM public.staff_role_modules AS role_module
 USING public.staff_roles AS staff_role, public.staff_modules AS module_row
 WHERE role_module.role_id = staff_role.id
   AND role_module.module_id = module_row.id
   AND staff_role.name = 'Promotion Campaign Manager'
   AND staff_role.is_system IS TRUE
   AND module_row.key <> 'promotion_campaigns';

INSERT INTO public.staff_role_modules (role_id, module_id)
SELECT staff_role.id, module_row.id
  FROM public.staff_roles AS staff_role
  JOIN public.staff_modules AS module_row ON module_row.key = 'promotion_campaigns'
 WHERE staff_role.name = 'Promotion Campaign Manager'
   AND staff_role.is_system IS TRUE
ON CONFLICT (role_id, module_id) DO NOTHING;

INSERT INTO public.staff_role_permissions (role_id, permission_id)
SELECT staff_role.id, permission.id
  FROM public.staff_roles AS staff_role
  JOIN public.staff_permissions AS permission
    ON permission.key = 'admin.promotion_campaign.manage'
 WHERE staff_role.name = 'Promotion Campaign Manager'
   AND staff_role.is_system IS TRUE
ON CONFLICT (role_id, permission_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.promotion_campaign_offer_is_eligible(
  p_kind TEXT,
  p_voucher_id UUID,
  p_product_id UUID,
  p_outlet_id UUID,
  p_as_of TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_kind = 'voucher' AND p_voucher_id IS NOT NULL
     AND p_product_id IS NULL AND p_outlet_id IS NULL THEN
    RETURN EXISTS (
      SELECT 1
        FROM public.vouchers AS voucher
        JOIN public.vendors AS vendor ON vendor.id = voucher.vendor_id
       WHERE voucher.id = p_voucher_id
         AND voucher.is_active = TRUE
         AND voucher.review_status = 'approved'
         AND voucher.vendor_review_status = 'approved'
         AND voucher.is_claimable = TRUE
         AND voucher.redemption_mode IN ('online', 'both')
         AND vendor.status = 'approved'
         AND (voucher.claim_from IS NULL OR voucher.claim_from <= p_as_of)
         AND (voucher.claim_until IS NULL OR voucher.claim_until >= p_as_of)
         AND (voucher.valid_from IS NULL OR voucher.valid_from <= p_as_of)
         AND (voucher.valid_until IS NULL OR voucher.valid_until >= p_as_of)
         AND (voucher.max_uses IS NULL OR voucher.uses_count + voucher.reserved_uses < voucher.max_uses)
         AND (
           voucher.outlet_id IS NULL
           OR EXISTS (
             SELECT 1 FROM public.outlets AS outlet
              WHERE outlet.id = voucher.outlet_id
                AND outlet.vendor_id = voucher.vendor_id
                AND outlet.status = 'active'
                AND outlet.review_status = 'approved'
           )
         )
         AND (
           voucher.product_id IS NULL
           OR EXISTS (
             SELECT 1
               FROM public.products AS product
               JOIN public.outlet_offers AS outlet_offer ON outlet_offer.product_id = product.id
               JOIN public.outlets AS outlet ON outlet.id = outlet_offer.outlet_id
              WHERE product.id = voucher.product_id
                AND product.vendor_id = voucher.vendor_id
                AND product.status = 'active'
                AND product.review_status = 'approved'
                AND outlet_offer.status = 'active'
                AND outlet.status = 'active'
                AND outlet.review_status = 'approved'
                AND (voucher.outlet_id IS NULL OR outlet.id = voucher.outlet_id)
           )
         )
         AND EXISTS (
           SELECT 1
             FROM public.products AS product
             JOIN public.outlet_offers AS outlet_offer ON outlet_offer.product_id = product.id
             JOIN public.outlets AS outlet ON outlet.id = outlet_offer.outlet_id
            WHERE product.vendor_id = voucher.vendor_id
              AND product.status = 'active'
              AND product.review_status = 'approved'
              AND outlet_offer.status = 'active'
              AND outlet.status = 'active'
              AND outlet.review_status = 'approved'
              AND (voucher.product_id IS NULL OR product.id = voucher.product_id)
              AND (voucher.outlet_id IS NULL OR outlet.id = voucher.outlet_id)
         )
    );
  ELSIF p_kind = 'product' AND p_voucher_id IS NULL
        AND p_product_id IS NOT NULL AND p_outlet_id IS NOT NULL THEN
    RETURN EXISTS (
      SELECT 1
        FROM public.products AS product
        JOIN public.vendors AS vendor ON vendor.id = product.vendor_id
        JOIN public.outlet_offers AS outlet_offer
          ON outlet_offer.product_id = product.id AND outlet_offer.outlet_id = p_outlet_id
        JOIN public.outlets AS outlet
          ON outlet.id = outlet_offer.outlet_id AND outlet.vendor_id = product.vendor_id
       WHERE product.id = p_product_id
         AND product.status = 'active'
         AND product.review_status = 'approved'
         AND vendor.status = 'approved'
         AND outlet_offer.status = 'active'
         AND outlet.status = 'active'
         AND outlet.review_status = 'approved'
    );
  END IF;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_promotion_campaign_draft(
  p_campaign_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_title TEXT,
  p_slug TEXT,
  p_summary TEXT,
  p_description TEXT,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_offers JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_campaign public.promotion_campaigns%ROWTYPE;
  v_offer JSONB;
  v_kind TEXT;
  v_voucher_id UUID;
  v_product_id UUID;
  v_outlet_id UUID;
  v_position INTEGER;
  v_as_of TIMESTAMPTZ;
BEGIN
  IF v_actor IS NULL OR NOT public.has_staff_permission(v_actor, 'admin.promotion_campaign.manage') THEN
    RAISE EXCEPTION 'promotion_campaign_permission_required';
  END IF;
  IF p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 3 AND 120
     OR p_slug IS NULL OR p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     OR p_summary IS NULL OR char_length(btrim(p_summary)) NOT BETWEEN 10 AND 240
     OR p_description IS NULL OR char_length(btrim(p_description)) NOT BETWEEN 10 AND 5000
     OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at
     OR jsonb_typeof(p_offers) <> 'array' OR jsonb_array_length(p_offers) > 24 THEN
    RAISE EXCEPTION 'promotion_campaign_invalid_draft';
  END IF;

  IF p_campaign_id IS NULL THEN
    IF p_expected_updated_at IS NOT NULL THEN
      RAISE EXCEPTION 'promotion_campaign_stale';
    END IF;
    INSERT INTO public.promotion_campaigns (
      slug, title, summary, description, starts_at, ends_at, created_by, updated_by
    ) VALUES (
      btrim(p_slug), btrim(p_title), btrim(p_summary), btrim(p_description),
      p_starts_at, p_ends_at, v_actor, v_actor
    ) RETURNING * INTO v_campaign;
  ELSE
    SELECT * INTO v_campaign
      FROM public.promotion_campaigns
     WHERE id = p_campaign_id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'promotion_campaign_not_found'; END IF;
    IF v_campaign.status NOT IN ('draft', 'rejected')
       OR p_expected_updated_at IS NULL
       OR v_campaign.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'promotion_campaign_stale';
    END IF;
    UPDATE public.promotion_campaigns
       SET slug = btrim(p_slug), title = btrim(p_title), summary = btrim(p_summary),
           description = btrim(p_description), starts_at = p_starts_at, ends_at = p_ends_at,
           status = CASE WHEN status = 'rejected' THEN 'draft' ELSE status END,
           rejection_note = CASE WHEN status = 'rejected' THEN NULL ELSE rejection_note END,
           updated_by = v_actor, updated_at = now()
     WHERE id = p_campaign_id
     RETURNING * INTO v_campaign;
    DELETE FROM public.promotion_campaign_offers WHERE campaign_id = p_campaign_id;
  END IF;

  v_as_of := greatest(now(), v_campaign.starts_at);
  FOR v_offer IN SELECT value FROM jsonb_array_elements(p_offers) AS offers(value) LOOP
    v_kind := v_offer->>'kind';
    v_voucher_id := NULL;
    v_product_id := NULL;
    v_outlet_id := NULL;
    v_position := (v_offer->>'position')::INTEGER;

    IF v_kind = 'voucher' THEN
      v_voucher_id := (v_offer->>'voucherId')::UUID;
    ELSIF v_kind = 'product' THEN
      v_product_id := (v_offer->>'productId')::UUID;
      v_outlet_id := (v_offer->>'outletId')::UUID;
    ELSE
      RAISE EXCEPTION 'promotion_campaign_invalid_offer';
    END IF;

    IF v_position IS NULL OR v_position < 0 OR v_position > 99
       OR NOT public.promotion_campaign_offer_is_eligible(
         v_kind, v_voucher_id, v_product_id, v_outlet_id, v_as_of
       ) THEN
      RAISE EXCEPTION 'campaign_offer_source_not_eligible';
    END IF;

    INSERT INTO public.promotion_campaign_offers (
      campaign_id, voucher_id, product_id, outlet_id, position
    ) VALUES (
      v_campaign.id, v_voucher_id, v_product_id, v_outlet_id, v_position
    );
  END LOOP;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
  VALUES (
    v_actor,
    CASE WHEN p_campaign_id IS NULL THEN 'promotion_campaign.created' ELSE 'promotion_campaign.draft_updated' END,
    'promotion_campaign', v_campaign.id,
    jsonb_build_object('status', v_campaign.status, 'slug', v_campaign.slug, 'offerCount', jsonb_array_length(p_offers))
  );

  RETURN to_jsonb(v_campaign) || jsonb_build_object('offer_count', jsonb_array_length(p_offers));
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_promotion_campaign(
  p_campaign_id UUID,
  p_action TEXT,
  p_expected_updated_at TIMESTAMPTZ,
  p_note TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_campaign public.promotion_campaigns%ROWTYPE;
  v_before JSONB;
  v_offer RECORD;
  v_offer_count INTEGER;
  v_as_of TIMESTAMPTZ;
  v_next_status TEXT;
BEGIN
  IF v_actor IS NULL OR NOT public.has_staff_permission(v_actor, 'admin.promotion_campaign.manage') THEN
    RAISE EXCEPTION 'promotion_campaign_permission_required';
  END IF;
  IF p_action NOT IN ('submit', 'approve', 'reject', 'pause', 'resume', 'archive')
     OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'promotion_campaign_invalid_transition';
  END IF;
  IF p_action = 'reject' AND char_length(btrim(coalesce(p_note, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'promotion_campaign_rejection_note_required';
  END IF;

  SELECT * INTO v_campaign
    FROM public.promotion_campaigns
   WHERE id = p_campaign_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'promotion_campaign_not_found'; END IF;
  IF v_campaign.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'promotion_campaign_stale';
  END IF;
  v_before := to_jsonb(v_campaign);
  v_as_of := greatest(now(), v_campaign.starts_at);

  IF p_action = 'submit' AND v_campaign.status IN ('draft', 'rejected') THEN
    v_next_status := 'pending_approval';
  ELSIF p_action = 'approve' AND v_campaign.status = 'pending_approval' THEN
    IF v_campaign.created_by IS NOT DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'promotion_campaign_creator_cannot_approve';
    END IF;
    v_next_status := 'approved';
  ELSIF p_action = 'reject' AND v_campaign.status = 'pending_approval' THEN
    v_next_status := 'rejected';
  ELSIF p_action = 'pause' AND v_campaign.status = 'approved' THEN
    v_next_status := 'paused';
  ELSIF p_action = 'resume' AND v_campaign.status = 'paused' AND v_campaign.ends_at > now() THEN
    v_next_status := 'approved';
  ELSIF p_action = 'archive' AND v_campaign.status <> 'archived' THEN
    v_next_status := 'archived';
  ELSE
    RAISE EXCEPTION 'promotion_campaign_invalid_transition';
  END IF;

  IF p_action IN ('submit', 'approve', 'resume') THEN
    SELECT count(*)::INTEGER INTO v_offer_count
      FROM public.promotion_campaign_offers AS offer
     WHERE offer.campaign_id = v_campaign.id
       AND public.promotion_campaign_offer_is_eligible(
         CASE WHEN offer.voucher_id IS NOT NULL THEN 'voucher' ELSE 'product' END,
         offer.voucher_id, offer.product_id, offer.outlet_id, v_as_of
       );
    IF v_offer_count = 0 THEN RAISE EXCEPTION 'promotion_campaign_no_eligible_offers'; END IF;
  END IF;

  UPDATE public.promotion_campaigns
     SET status = v_next_status,
         updated_by = v_actor,
         updated_at = now(),
         approved_by = CASE WHEN p_action = 'approve' THEN v_actor WHEN p_action = 'submit' THEN NULL ELSE approved_by END,
         approved_at = CASE WHEN p_action = 'approve' THEN now() WHEN p_action = 'submit' THEN NULL ELSE approved_at END,
         rejection_note = CASE WHEN p_action = 'reject' THEN btrim(p_note) WHEN p_action IN ('submit', 'approve') THEN NULL ELSE rejection_note END
   WHERE id = v_campaign.id
   RETURNING * INTO v_campaign;

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, before_data, after_data, note)
  VALUES (
    v_actor,
    'promotion_campaign.' || p_action,
    'promotion_campaign',
    v_campaign.id,
    v_before,
    jsonb_build_object('status', v_campaign.status, 'slug', v_campaign.slug, 'approvedBy', v_campaign.approved_by),
    nullif(btrim(p_note), '')
  );

  RETURN to_jsonb(v_campaign);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_promotion_campaigns(p_slug TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign RECORD;
  v_source RECORD;
  v_offers JSONB;
  v_offer JSONB;
  v_result JSONB := '[]'::JSONB;
  v_as_of TIMESTAMPTZ;
  v_visibility TEXT;
BEGIN
  FOR v_campaign IN
    SELECT campaign.*
      FROM public.promotion_campaigns AS campaign
     WHERE campaign.status = 'approved'
       AND campaign.ends_at > now()
       AND (p_slug IS NULL OR campaign.slug = p_slug)
     ORDER BY campaign.starts_at ASC, campaign.created_at DESC
  LOOP
    v_as_of := greatest(now(), v_campaign.starts_at);
    v_offers := '[]'::JSONB;

    FOR v_source IN
      SELECT offer.*
        FROM public.promotion_campaign_offers AS offer
       WHERE offer.campaign_id = v_campaign.id
       ORDER BY offer.position ASC, offer.id ASC
    LOOP
      IF v_source.voucher_id IS NOT NULL THEN
        IF NOT public.promotion_campaign_offer_is_eligible('voucher', v_source.voucher_id, NULL, NULL, v_as_of) THEN
          CONTINUE;
        END IF;

        SELECT jsonb_build_object(
          'kind', 'voucher',
          'id', v_source.id,
          'position', v_source.position,
          'vendor', jsonb_build_object('id', vendor.id, 'name', vendor.name, 'logoUrl', vendor.logo_url),
          'outlet', CASE WHEN voucher.outlet_id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', outlet.id, 'name', outlet.name, 'city', outlet.city, 'state', outlet.state,
            'imageUrl', outlet_page.hero_url
          ) END,
          'eligibleOutlets', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', eligible_outlet.id, 'name', eligible_outlet.name,
              'city', eligible_outlet.city, 'state', eligible_outlet.state,
              'imageUrl', eligible_page.hero_url
            ) ORDER BY eligible_outlet.name)
              FROM public.outlets AS eligible_outlet
              LEFT JOIN public.outlet_pages AS eligible_page ON eligible_page.outlet_id = eligible_outlet.id
             WHERE eligible_outlet.vendor_id = voucher.vendor_id
               AND eligible_outlet.status = 'active'
               AND eligible_outlet.review_status = 'approved'
               AND (voucher.outlet_id IS NULL OR eligible_outlet.id = voucher.outlet_id)
               AND EXISTS (
                 SELECT 1
                   FROM public.products AS eligible_product
                   JOIN public.outlet_offers AS eligible_offer
                     ON eligible_offer.product_id = eligible_product.id
                    AND eligible_offer.outlet_id = eligible_outlet.id
                  WHERE eligible_product.vendor_id = voucher.vendor_id
                    AND eligible_product.status = 'active'
                    AND eligible_product.review_status = 'approved'
                    AND eligible_offer.status = 'active'
                    AND (voucher.product_id IS NULL OR eligible_product.id = voucher.product_id)
               )
          ), '[]'::JSONB),
          'voucher', jsonb_build_object(
            'id', voucher.id, 'name', voucher.name, 'voucherType', voucher.voucher_type,
            'discountValue', voucher.discount_value, 'minSpend', COALESCE(voucher.min_spend, 0),
            'validFrom', voucher.valid_from, 'validUntil', voucher.valid_until,
            'maxUses', voucher.max_uses, 'usesCount', voucher.uses_count + voucher.reserved_uses,
            'redemptionMode', voucher.redemption_mode
          ),
          'eligibleProducts', COALESCE((
            SELECT jsonb_agg(DISTINCT jsonb_build_object('id', eligible_product.id, 'name', eligible_product.name))
              FROM public.products AS eligible_product
              JOIN public.outlet_offers AS eligible_offer ON eligible_offer.product_id = eligible_product.id
              JOIN public.outlets AS eligible_outlet ON eligible_outlet.id = eligible_offer.outlet_id
             WHERE eligible_product.vendor_id = voucher.vendor_id
               AND eligible_product.status = 'active'
               AND eligible_product.review_status = 'approved'
               AND eligible_offer.status = 'active'
               AND eligible_outlet.status = 'active'
               AND eligible_outlet.review_status = 'approved'
               AND (voucher.product_id IS NULL OR eligible_product.id = voucher.product_id)
               AND (voucher.outlet_id IS NULL OR eligible_outlet.id = voucher.outlet_id)
          ), '[]'::JSONB)
        ) INTO v_offer
          FROM public.vouchers AS voucher
          JOIN public.vendors AS vendor ON vendor.id = voucher.vendor_id
          LEFT JOIN public.outlets AS outlet ON outlet.id = voucher.outlet_id
          LEFT JOIN public.outlet_pages AS outlet_page ON outlet_page.outlet_id = outlet.id
         WHERE voucher.id = v_source.voucher_id;
      ELSE
        IF NOT public.promotion_campaign_offer_is_eligible('product', NULL, v_source.product_id, v_source.outlet_id, v_as_of) THEN
          CONTINUE;
        END IF;

        SELECT jsonb_build_object(
          'kind', 'product',
          'id', v_source.id,
          'position', v_source.position,
          'vendor', jsonb_build_object('id', vendor.id, 'name', vendor.name, 'logoUrl', vendor.logo_url),
          'outlet', jsonb_build_object(
            'id', outlet.id, 'name', outlet.name, 'city', outlet.city, 'state', outlet.state,
            'imageUrl', outlet_page.hero_url
          ),
          'product', jsonb_build_object(
            'id', product.id, 'name', product.name, 'description', product.description,
            'price', outlet_offer.price, 'imageUrl', COALESCE(product.cover_url, product_media.url)
          )
        ) INTO v_offer
          FROM public.products AS product
          JOIN public.vendors AS vendor ON vendor.id = product.vendor_id
          JOIN public.outlet_offers AS outlet_offer
            ON outlet_offer.product_id = product.id AND outlet_offer.outlet_id = v_source.outlet_id
          JOIN public.outlets AS outlet ON outlet.id = outlet_offer.outlet_id
          LEFT JOIN public.outlet_pages AS outlet_page ON outlet_page.outlet_id = outlet.id
          LEFT JOIN LATERAL (
            SELECT media.url
              FROM public.media_assets AS media
             WHERE media.product_id = product.id AND media.media_type = 'image'
             ORDER BY media.sort_order NULLS LAST, media.created_at
             LIMIT 1
          ) AS product_media ON TRUE
         WHERE product.id = v_source.product_id;
      END IF;

      IF v_offer IS NOT NULL THEN
        v_offers := v_offers || jsonb_build_array(v_offer);
        v_offer := NULL;
      END IF;
    END LOOP;

    IF jsonb_array_length(v_offers) > 0 THEN
      v_visibility := CASE WHEN v_campaign.starts_at <= now() THEN 'live' ELSE 'upcoming' END;
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'id', v_campaign.id,
        'slug', v_campaign.slug,
        'title', v_campaign.title,
        'summary', v_campaign.summary,
        'description', v_campaign.description,
        'startsAt', v_campaign.starts_at,
        'endsAt', v_campaign.ends_at,
        'visibility', v_visibility,
        'offers', v_offers
      ));
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_promotion_campaign_sources()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_products JSONB;
  v_vouchers JSONB;
BEGIN
  IF v_actor IS NULL OR NOT public.has_staff_permission(v_actor, 'admin.promotion_campaign.manage') THEN
    RAISE EXCEPTION 'promotion_campaign_permission_required';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'productId', product.id,
    'productName', product.name,
    'productType', product.product_type,
    'vendorId', vendor.id,
    'vendorName', vendor.name,
    'outletId', outlet.id,
    'outletName', outlet.name,
    'city', outlet.city,
    'state', outlet.state,
    'price', outlet_offer.price,
    'imageUrl', product.cover_url
  ) ORDER BY vendor.name, product.name, outlet.name), '[]'::JSONB)
    INTO v_products
    FROM public.products AS product
    JOIN public.vendors AS vendor ON vendor.id = product.vendor_id
    JOIN public.outlet_offers AS outlet_offer ON outlet_offer.product_id = product.id
    JOIN public.outlets AS outlet ON outlet.id = outlet_offer.outlet_id
   WHERE product.status = 'active'
     AND product.review_status = 'approved'
     AND vendor.status = 'approved'
     AND outlet_offer.status = 'active'
     AND outlet.status = 'active'
     AND outlet.review_status = 'approved';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'voucherId', voucher.id,
    'name', voucher.name,
    'voucherType', voucher.voucher_type,
    'discountValue', voucher.discount_value,
    'vendorId', vendor.id,
    'vendorName', vendor.name,
    'outletId', outlet.id,
    'outletName', outlet.name,
    'claimFrom', voucher.claim_from,
    'claimUntil', voucher.claim_until,
    'validFrom', voucher.valid_from,
    'validUntil', voucher.valid_until,
    'maxUses', voucher.max_uses,
    'usesCount', voucher.uses_count + voucher.reserved_uses
  ) ORDER BY vendor.name, voucher.name), '[]'::JSONB)
    INTO v_vouchers
    FROM public.vouchers AS voucher
    JOIN public.vendors AS vendor ON vendor.id = voucher.vendor_id
    LEFT JOIN public.outlets AS outlet ON outlet.id = voucher.outlet_id
   WHERE voucher.is_active = TRUE
     AND voucher.review_status = 'approved'
     AND voucher.vendor_review_status = 'approved'
     AND voucher.is_claimable = TRUE
     AND voucher.redemption_mode IN ('online', 'both')
     AND vendor.status = 'approved'
     AND (voucher.claim_until IS NULL OR voucher.claim_until >= now())
     AND (voucher.valid_until IS NULL OR voucher.valid_until >= now())
     AND (voucher.max_uses IS NULL OR voucher.uses_count + voucher.reserved_uses < voucher.max_uses)
     AND (voucher.outlet_id IS NULL OR (
       outlet.status = 'active' AND outlet.review_status = 'approved'
     ))
     AND EXISTS (
       SELECT 1
         FROM public.products AS product
         JOIN public.outlet_offers AS outlet_offer ON outlet_offer.product_id = product.id
         JOIN public.outlets AS eligible_outlet ON eligible_outlet.id = outlet_offer.outlet_id
        WHERE product.vendor_id = voucher.vendor_id
          AND product.status = 'active'
          AND product.review_status = 'approved'
          AND outlet_offer.status = 'active'
          AND eligible_outlet.status = 'active'
          AND eligible_outlet.review_status = 'approved'
          AND (voucher.product_id IS NULL OR product.id = voucher.product_id)
          AND (voucher.outlet_id IS NULL OR eligible_outlet.id = voucher.outlet_id)
     );

  RETURN jsonb_build_object('products', v_products, 'vouchers', v_vouchers);
END;
$$;

REVOKE ALL ON FUNCTION public.promotion_campaign_offer_is_eligible(TEXT, UUID, UUID, UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_promotion_campaign_draft(UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.transition_promotion_campaign(UUID, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_admin_promotion_campaign_sources() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_promotion_campaigns(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_promotion_campaign_draft(UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_promotion_campaign(UUID, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_promotion_campaign_sources() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_promotion_campaigns(TEXT) TO anon, authenticated;
