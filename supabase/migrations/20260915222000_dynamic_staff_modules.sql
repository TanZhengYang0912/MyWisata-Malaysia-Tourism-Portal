-- Database-backed Staff Modules, atomic Module groups, and dynamic Admin navigation.
-- Existing staff_permissions remains the security capability catalogue;
-- Modules are the configurable business/navigation layer above it.

CREATE TABLE IF NOT EXISTS public.staff_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  label_key TEXT,
  description TEXT,
  section_key TEXT NOT NULL,
  section_label TEXT NOT NULL,
  section_label_key TEXT,
  section_sort_order INTEGER NOT NULL DEFAULT 0,
  href TEXT UNIQUE NOT NULL,
  icon_key TEXT NOT NULL DEFAULT 'activity',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_modules_key_format CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT staff_modules_label_present CHECK (char_length(BTRIM(label)) BETWEEN 1 AND 100),
  CONSTRAINT staff_modules_section_key_format CHECK (section_key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT staff_modules_section_label_present CHECK (char_length(BTRIM(section_label)) BETWEEN 1 AND 100),
  CONSTRAINT staff_modules_admin_href CHECK (href ~ '^/admin(?:/.*)?$' AND href !~ '[?#]'),
  CONSTRAINT staff_modules_icon_key_format CHECK (icon_key ~ '^[a-z][a-z0-9-]*$'),
  CONSTRAINT staff_modules_description_length CHECK (description IS NULL OR char_length(description) <= 1000)
);

CREATE TABLE IF NOT EXISTS public.staff_module_permissions (
  module_id UUID NOT NULL REFERENCES public.staff_modules(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.staff_permissions(id) ON DELETE RESTRICT,
  PRIMARY KEY (module_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.staff_role_modules (
  role_id UUID NOT NULL REFERENCES public.staff_roles(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.staff_modules(id) ON DELETE RESTRICT,
  PRIMARY KEY (role_id, module_id)
);

CREATE TABLE IF NOT EXISTS public.staff_module_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT staff_module_groups_key_format CHECK (key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT staff_module_groups_name_present CHECK (char_length(BTRIM(name)) BETWEEN 1 AND 100)
);

CREATE TABLE IF NOT EXISTS public.staff_module_group_members (
  group_id UUID NOT NULL REFERENCES public.staff_module_groups(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES public.staff_modules(id) ON DELETE RESTRICT,
  PRIMARY KEY (group_id, module_id),
  UNIQUE (module_id)
);

CREATE TABLE IF NOT EXISTS public.staff_module_legacy_roles (
  module_id UUID NOT NULL REFERENCES public.staff_modules(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL,
  grants_permissions BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (module_id, role_name),
  CONSTRAINT staff_module_legacy_roles_name CHECK (
    role_name IN ('admin', 'approver', 'staff', 'super_admin')
  )
);

CREATE INDEX IF NOT EXISTS staff_modules_navigation_order_idx
  ON public.staff_modules (section_sort_order, sort_order, key)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS staff_role_modules_module_idx
  ON public.staff_role_modules (module_id, role_id);
CREATE INDEX IF NOT EXISTS staff_module_permissions_permission_idx
  ON public.staff_module_permissions (permission_id, module_id);

INSERT INTO public.staff_permissions (key, module, action, description, is_system)
VALUES (
  'admin.catalogue.review',
  'catalogue',
  'review',
  'Review and decide pending catalogue listings',
  TRUE
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
VALUES
  ('overview', 'Overview', 'navigation.Overview', 'Admin workspace overview', 'workspace', 'Workspace', 'navigationSections.workspace', 10, '/admin/dashboard', 'activity', 10, TRUE),
  ('vendor_approvals', 'Vendor Approvals', 'navigation.Vendor Approvals', 'Review pending vendor applications', 'governance', 'Governance', 'navigationSections.governance', 20, '/admin/vendors', 'package', 10, TRUE),
  ('catalogue_review', 'Catalogue Review', 'navigation.Catalogue Review', 'Review pending catalogue listings', 'governance', 'Governance', 'navigationSections.governance', 20, '/admin/catalogue', 'clipboard-check', 20, TRUE),
  ('sponsored_placements', 'Sponsored Placements', 'navigation.Sponsored Placements', 'Manage sponsored discovery placements', 'governance', 'Governance', 'navigationSections.governance', 20, '/admin/sponsored-placements', 'megaphone', 30, TRUE),
  ('kyc_review', 'KYC Review', 'navigation.KYC Review', 'Review KYC submissions', 'governance', 'Governance', 'navigationSections.governance', 20, '/admin/kyc', 'shield', 40, TRUE),
  ('recommendations', 'Recommendations', 'navigation.Recommendations', 'Review customer recommendations', 'governance', 'Governance', 'navigationSections.governance', 20, '/admin/recommendations', 'gem', 50, TRUE),
  ('withdrawals', 'Withdrawals', 'navigation.Withdrawals', 'Review wallet withdrawal requests', 'finance', 'Finance', 'navigationSections.finance', 30, '/admin/withdrawals', 'dollar-sign', 10, TRUE),
  ('refunds', 'Refunds', 'navigation.Refunds', 'Review refund requests', 'finance', 'Finance', 'navigationSections.finance', 30, '/admin/refunds', 'rotate-ccw', 20, TRUE),
  ('wallet_settings', 'Wallet Settings', 'navigation.Wallet Settings', 'Configure wallet governance', 'finance', 'Finance', 'navigationSections.finance', 30, '/admin/wallet/settings', 'settings-2', 30, TRUE),
  ('wallet_approvers', 'Wallet Approvers', 'navigation.Wallet Approvers', 'Manage wallet approvers', 'finance', 'Finance', 'navigationSections.finance', 30, '/admin/wallet/approvers', 'user-round-check', 40, TRUE),
  ('payout_reports', 'Payout Reports', 'navigation.Payout Reports', 'View payout reports', 'finance', 'Finance', 'navigationSections.finance', 30, '/admin/reports/payouts', 'file-bar-chart-2', 50, TRUE),
  ('reconciliation', 'Reconciliation', 'navigation.Reconciliation', 'Review payment reconciliation', 'finance', 'Finance', 'navigationSections.finance', 30, '/admin/reports/reconciliation', 'scale', 60, TRUE),
  ('support_tickets', 'Support Tickets', 'navigation.Support Tickets', 'Manage support tickets', 'support', 'Support', 'navigationSections.support', 40, '/admin/support', 'inbox', 10, TRUE),
  ('chat_reports', 'Chat Reports', 'navigation.Chat Reports', 'Review reported conversations', 'support', 'Support', 'navigationSections.support', 40, '/admin/chat-reports', 'flag', 20, TRUE),
  ('affiliate', 'Affiliate', 'navigation.Affiliate', 'Manage affiliate governance', 'support', 'Support', 'navigationSections.support', 40, '/admin/affiliate', 'link-2', 30, TRUE),
  ('chatbot', 'Chatbot', 'navigation.Chatbot', 'Manage chatbot knowledge', 'support', 'Support', 'navigationSections.support', 40, '/admin/chatbot', 'bot', 40, TRUE),
  ('user_management', 'User Management', 'navigation.User Management', 'Manage platform users', 'administration', 'Administration', 'navigationSections.administration', 50, '/admin/users', 'users-round', 10, TRUE),
  ('access_control', 'Access Control', 'navigation.Access Control', 'Manage platform access', 'administration', 'Administration', 'navigationSections.administration', 50, '/admin/access-control', 'shield-cog', 20, TRUE),
  ('ai_assistant', 'AI Assistant', 'navigation.AI Assistant', 'Use the Admin AI assistant', 'administration', 'Administration', 'navigationSections.administration', 50, '/admin/ai-assistant', 'sparkles', 30, TRUE),
  ('staff_conduct', 'Staff Conduct', 'navigation.Staff Conduct', 'Review staff conduct reports', 'administration', 'Administration', 'navigationSections.administration', 50, '/admin/staff-conduct', 'user-x', 40, TRUE),
  ('moderation_words', 'Moderation Words', NULL, 'Manage blocked moderation terms', 'administration', 'Administration', 'navigationSections.administration', 50, '/admin/moderation-words', 'shield-ban', 50, TRUE)
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
  FROM (VALUES
    ('vendor_approvals', 'admin.vendor.manage'),
    ('catalogue_review', 'admin.catalogue.review'),
    ('sponsored_placements', 'admin.map_campaign.manage'),
    ('kyc_review', 'admin.kyc.review'),
    ('withdrawals', 'admin.withdrawal.approve')
  ) AS mapping(module_key, permission_key)
  JOIN public.staff_modules AS module_row ON module_row.key = mapping.module_key
  JOIN public.staff_permissions AS permission ON permission.key = mapping.permission_key
ON CONFLICT (module_id, permission_id) DO NOTHING;

INSERT INTO public.staff_module_groups (key, name, description, is_system, is_active)
VALUES (
  'catalogue_governance',
  'Catalogue governance',
  'Vendor Approvals and Catalogue Review share one indivisible governance workflow.',
  TRUE,
  TRUE
)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_system = TRUE,
  is_active = TRUE,
  updated_at = now();

INSERT INTO public.staff_module_group_members (group_id, module_id)
SELECT module_group.id, module_row.id
  FROM public.staff_module_groups AS module_group
  JOIN public.staff_modules AS module_row
    ON module_row.key IN ('vendor_approvals', 'catalogue_review')
 WHERE module_group.key = 'catalogue_governance'
ON CONFLICT (group_id, module_id) DO NOTHING;

-- Database-owned compatibility menu visibility reproduces the current Admin
-- and wallet-Approver sidebars. grants_permissions is deliberately separate:
-- seeing a menu record is not, by itself, an authorization grant.
INSERT INTO public.staff_module_legacy_roles (module_id, role_name, grants_permissions)
SELECT module_row.id, mapping.role_name, mapping.grants_permissions
  FROM (VALUES
    ('overview', 'admin', FALSE),
    ('vendor_approvals', 'admin', TRUE),
    ('catalogue_review', 'admin', TRUE),
    ('sponsored_placements', 'admin', FALSE),
    ('kyc_review', 'admin', TRUE),
    ('recommendations', 'admin', FALSE),
    ('refunds', 'admin', FALSE),
    ('support_tickets', 'admin', FALSE),
    ('chat_reports', 'admin', FALSE),
    ('affiliate', 'admin', FALSE),
    ('chatbot', 'admin', FALSE),
    ('withdrawals', 'approver', TRUE)
  ) AS mapping(module_key, role_name, grants_permissions)
  JOIN public.staff_modules AS module_row ON module_row.key = mapping.module_key
ON CONFLICT (module_id, role_name) DO UPDATE SET
  grants_permissions = EXCLUDED.grants_permissions;

-- Backfill Module assignments from existing role-permission rows, then close
-- every atomic group. Existing Staff roles continue to work after the switch.
INSERT INTO public.staff_role_modules (role_id, module_id)
SELECT DISTINCT role_permission.role_id, module_permission.module_id
  FROM public.staff_role_permissions AS role_permission
  JOIN public.staff_module_permissions AS module_permission
    ON module_permission.permission_id = role_permission.permission_id
ON CONFLICT (role_id, module_id) DO NOTHING;

INSERT INTO public.staff_role_modules (role_id, module_id)
SELECT DISTINCT selected.role_id, grouped_peer.module_id
  FROM public.staff_role_modules AS selected
  JOIN public.staff_module_group_members AS selected_group
    ON selected_group.module_id = selected.module_id
  JOIN public.staff_module_groups AS module_group
    ON module_group.id = selected_group.group_id
   AND module_group.is_active = TRUE
  JOIN public.staff_module_group_members AS grouped_peer
    ON grouped_peer.group_id = selected_group.group_id
ON CONFLICT (role_id, module_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.validate_staff_module_keys(p_module_keys TEXT[])
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keys TEXT[];
BEGIN
  IF p_module_keys IS NULL OR EXISTS (
    SELECT 1
      FROM unnest(p_module_keys) AS requested(module_key)
     WHERE requested.module_key IS NULL
        OR requested.module_key <> BTRIM(requested.module_key)
        OR NOT EXISTS (
          SELECT 1
            FROM public.staff_modules AS module_row
           WHERE module_row.key = requested.module_key
             AND module_row.is_active = TRUE
        )
  ) THEN
    RAISE EXCEPTION 'invalid_module_key';
  END IF;

  IF EXISTS (
    SELECT requested.module_key
      FROM unnest(p_module_keys) AS requested(module_key)
     GROUP BY requested.module_key
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate_module_key';
  END IF;

  WITH requested_modules AS (
    SELECT module_row.id
      FROM public.staff_modules AS module_row
     WHERE module_row.key = ANY(p_module_keys)
       AND module_row.is_active = TRUE
  ), expanded_modules AS (
    SELECT requested.id AS module_id
      FROM requested_modules AS requested
    UNION
    SELECT grouped_peer.module_id
      FROM requested_modules AS requested
      JOIN public.staff_module_group_members AS selected_group
        ON selected_group.module_id = requested.id
      JOIN public.staff_module_groups AS module_group
        ON module_group.id = selected_group.group_id
       AND module_group.is_active = TRUE
      JOIN public.staff_module_group_members AS grouped_peer
        ON grouped_peer.group_id = selected_group.group_id
  )
  SELECT COALESCE(array_agg(module_row.key ORDER BY module_row.key), ARRAY[]::TEXT[])
    INTO v_keys
    FROM expanded_modules AS expanded
    JOIN public.staff_modules AS module_row ON module_row.id = expanded.module_id;

  RETURN v_keys;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_staff_role_permissions(p_role_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.staff_role_permissions
   WHERE role_id = p_role_id;

  INSERT INTO public.staff_role_permissions (role_id, permission_id)
  SELECT DISTINCT p_role_id, module_permission.permission_id
    FROM public.staff_role_modules AS role_module
    JOIN public.staff_modules AS module_row
      ON module_row.id = role_module.module_id
     AND module_row.is_active = TRUE
    JOIN public.staff_module_permissions AS module_permission
      ON module_permission.module_id = role_module.module_id
   WHERE role_module.role_id = p_role_id
  ON CONFLICT (role_id, permission_id) DO NOTHING;
END;
$$;

DO $$
DECLARE
  v_role_id UUID;
BEGIN
  FOR v_role_id IN SELECT id FROM public.staff_roles LOOP
    PERFORM public.sync_staff_role_permissions(v_role_id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_staff_module(
  p_key TEXT,
  p_label TEXT,
  p_label_key TEXT,
  p_description TEXT,
  p_section_key TEXT,
  p_section_label TEXT,
  p_section_label_key TEXT,
  p_section_sort_order INTEGER,
  p_href TEXT,
  p_icon_key TEXT,
  p_sort_order INTEGER,
  p_permission_keys TEXT[],
  p_group_key TEXT,
  p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_module_id UUID;
  v_permission_keys TEXT[];
  v_group public.staff_module_groups%ROWTYPE;
BEGIN
  v_actor := public.require_active_global_staff_super_admin();
  PERFORM public.validate_staff_reason(p_reason);
  v_permission_keys := public.validate_staff_permission_keys(p_permission_keys);

  IF p_key IS NULL OR p_key !~ '^[a-z][a-z0-9_]*$'
     OR p_label IS NULL OR char_length(BTRIM(p_label)) NOT BETWEEN 1 AND 100
     OR p_section_key IS NULL OR p_section_key !~ '^[a-z][a-z0-9_]*$'
     OR p_section_label IS NULL OR char_length(BTRIM(p_section_label)) NOT BETWEEN 1 AND 100
     OR p_href IS NULL OR p_href !~ '^/admin(?:/.*)?$' OR p_href ~ '[?#]'
     OR p_icon_key IS NULL OR p_icon_key !~ '^[a-z][a-z0-9-]*$'
     OR p_section_sort_order IS NULL OR p_sort_order IS NULL THEN
    RAISE EXCEPTION 'invalid_staff_module';
  END IF;

  IF p_group_key IS NOT NULL THEN
    SELECT * INTO v_group
      FROM public.staff_module_groups
     WHERE key = p_group_key AND is_active = TRUE;
    IF NOT FOUND THEN RAISE EXCEPTION 'staff_module_group_not_found'; END IF;
    IF v_group.is_system THEN RAISE EXCEPTION 'system_module_group_protected'; END IF;
  END IF;

  INSERT INTO public.staff_modules (
    key, label, label_key, description, section_key, section_label,
    section_label_key, section_sort_order, href, icon_key, sort_order,
    is_active, is_system, created_by
  ) VALUES (
    p_key, BTRIM(p_label), NULLIF(BTRIM(p_label_key), ''), NULLIF(BTRIM(p_description), ''),
    p_section_key, BTRIM(p_section_label), NULLIF(BTRIM(p_section_label_key), ''),
    p_section_sort_order, p_href, p_icon_key, p_sort_order, TRUE, FALSE, v_actor
  ) RETURNING id INTO v_module_id;

  INSERT INTO public.staff_module_permissions (module_id, permission_id)
  SELECT v_module_id, permission.id
    FROM public.staff_permissions AS permission
   WHERE permission.key = ANY(v_permission_keys);

  IF v_group.id IS NOT NULL THEN
    INSERT INTO public.staff_module_group_members (group_id, module_id)
    VALUES (v_group.id, v_module_id);
  END IF;

  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor,
    'staff.module.created',
    'staff_module',
    v_module_id,
    NULL,
    jsonb_build_object(
      'moduleKey', p_key,
      'href', p_href,
      'permissionKeys', v_permission_keys,
      'groupKey', p_group_key,
      'isActive', TRUE
    ),
    BTRIM(p_reason)
  );

  RETURN v_module_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_staff_module(
  p_module_id UUID,
  p_label TEXT,
  p_label_key TEXT,
  p_description TEXT,
  p_section_key TEXT,
  p_section_label TEXT,
  p_section_label_key TEXT,
  p_section_sort_order INTEGER,
  p_href TEXT,
  p_icon_key TEXT,
  p_sort_order INTEGER,
  p_permission_keys TEXT[],
  p_group_key TEXT,
  p_active BOOLEAN,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_module public.staff_modules%ROWTYPE;
  v_permission_keys TEXT[];
  v_before_permission_keys TEXT[];
  v_before_group public.staff_module_groups%ROWTYPE;
  v_group public.staff_module_groups%ROWTYPE;
  v_role_id UUID;
BEGIN
  v_actor := public.require_active_global_staff_super_admin();
  PERFORM public.validate_staff_reason(p_reason);
  v_permission_keys := public.validate_staff_permission_keys(p_permission_keys);

  SELECT * INTO v_module
    FROM public.staff_modules
   WHERE id = p_module_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_module_not_found'; END IF;

  IF p_label IS NULL OR char_length(BTRIM(p_label)) NOT BETWEEN 1 AND 100
     OR p_section_key IS NULL OR p_section_key !~ '^[a-z][a-z0-9_]*$'
     OR p_section_label IS NULL OR char_length(BTRIM(p_section_label)) NOT BETWEEN 1 AND 100
     OR p_href IS NULL OR p_href !~ '^/admin(?:/.*)?$' OR p_href ~ '[?#]'
     OR p_icon_key IS NULL OR p_icon_key !~ '^[a-z][a-z0-9-]*$'
     OR p_section_sort_order IS NULL OR p_sort_order IS NULL OR p_active IS NULL THEN
    RAISE EXCEPTION 'invalid_staff_module';
  END IF;

  SELECT module_group.* INTO v_before_group
    FROM public.staff_module_group_members AS member
    JOIN public.staff_module_groups AS module_group ON module_group.id = member.group_id
   WHERE member.module_id = p_module_id;

  IF v_before_group.is_system
     AND p_group_key IS DISTINCT FROM v_before_group.key THEN
    RAISE EXCEPTION 'system_module_group_protected';
  END IF;

  IF p_group_key IS NOT NULL THEN
    SELECT * INTO v_group
      FROM public.staff_module_groups
     WHERE key = p_group_key AND is_active = TRUE;
    IF NOT FOUND THEN RAISE EXCEPTION 'staff_module_group_not_found'; END IF;
    IF v_group.is_system AND v_group.key IS DISTINCT FROM v_before_group.key THEN
      RAISE EXCEPTION 'system_module_group_protected';
    END IF;
  END IF;

  SELECT COALESCE(array_agg(permission.key ORDER BY permission.key), ARRAY[]::TEXT[])
    INTO v_before_permission_keys
    FROM public.staff_module_permissions AS module_permission
    JOIN public.staff_permissions AS permission ON permission.id = module_permission.permission_id
   WHERE module_permission.module_id = p_module_id;

  UPDATE public.staff_modules
     SET label = BTRIM(p_label),
         label_key = NULLIF(BTRIM(p_label_key), ''),
         description = NULLIF(BTRIM(p_description), ''),
         section_key = p_section_key,
         section_label = BTRIM(p_section_label),
         section_label_key = NULLIF(BTRIM(p_section_label_key), ''),
         section_sort_order = p_section_sort_order,
         href = p_href,
         icon_key = p_icon_key,
         sort_order = p_sort_order,
         is_active = p_active,
         updated_at = now()
   WHERE id = p_module_id;

  DELETE FROM public.staff_module_permissions WHERE module_id = p_module_id;
  INSERT INTO public.staff_module_permissions (module_id, permission_id)
  SELECT p_module_id, permission.id
    FROM public.staff_permissions AS permission
   WHERE permission.key = ANY(v_permission_keys);

  IF COALESCE(v_before_group.is_system, FALSE) = FALSE THEN
    DELETE FROM public.staff_module_group_members WHERE module_id = p_module_id;
    IF v_group.id IS NOT NULL THEN
      INSERT INTO public.staff_module_group_members (group_id, module_id)
      VALUES (v_group.id, p_module_id);
    END IF;
  END IF;

  FOR v_role_id IN
    SELECT DISTINCT role_id FROM public.staff_role_modules WHERE module_id = p_module_id
  LOOP
    PERFORM public.sync_staff_role_permissions(v_role_id);
  END LOOP;

  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor,
    'staff.module.updated',
    'staff_module',
    p_module_id,
    jsonb_build_object(
      'href', v_module.href,
      'permissionKeys', v_before_permission_keys,
      'groupKey', v_before_group.key,
      'isActive', v_module.is_active
    ),
    jsonb_build_object(
      'href', p_href,
      'permissionKeys', v_permission_keys,
      'groupKey', p_group_key,
      'isActive', p_active
    ),
    BTRIM(p_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_staff_role_with_modules(
  p_name TEXT,
  p_description TEXT,
  p_module_keys TEXT[],
  p_reason TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_role_id UUID;
  v_module_keys TEXT[];
  v_permission_keys TEXT[];
BEGIN
  v_actor := public.require_active_global_staff_super_admin();
  PERFORM public.validate_staff_reason(p_reason);
  IF p_name IS NULL OR char_length(BTRIM(p_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'staff_role_name_required';
  END IF;
  IF p_description IS NOT NULL AND char_length(BTRIM(p_description)) > 1000 THEN
    RAISE EXCEPTION 'staff_role_description_too_long';
  END IF;

  v_module_keys := public.validate_staff_module_keys(p_module_keys);

  INSERT INTO public.staff_roles (name, description, is_system, is_active, created_by)
  VALUES (BTRIM(p_name), NULLIF(BTRIM(p_description), ''), FALSE, TRUE, v_actor)
  RETURNING id INTO v_role_id;

  INSERT INTO public.staff_role_modules (role_id, module_id)
  SELECT v_role_id, module_row.id
    FROM public.staff_modules AS module_row
   WHERE module_row.key = ANY(v_module_keys);

  PERFORM public.sync_staff_role_permissions(v_role_id);

  SELECT COALESCE(array_agg(permission.key ORDER BY permission.key), ARRAY[]::TEXT[])
    INTO v_permission_keys
    FROM public.staff_role_permissions AS role_permission
    JOIN public.staff_permissions AS permission ON permission.id = role_permission.permission_id
   WHERE role_permission.role_id = v_role_id;

  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor,
    'staff.role.created',
    'staff_role',
    v_role_id,
    NULL,
    jsonb_build_object(
      'roleId', v_role_id,
      'moduleKeys', v_module_keys,
      'permissionKeys', v_permission_keys,
      'isSystem', FALSE,
      'isActive', TRUE
    ),
    BTRIM(p_reason)
  );

  RETURN v_role_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_staff_role_with_modules(
  p_role_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_module_keys TEXT[],
  p_active BOOLEAN,
  p_reason TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID;
  v_role public.staff_roles%ROWTYPE;
  v_module_keys TEXT[];
  v_before_module_keys TEXT[];
  v_permission_keys TEXT[];
BEGIN
  v_actor := public.require_active_global_staff_super_admin();
  PERFORM public.validate_staff_reason(p_reason);
  IF p_name IS NULL OR char_length(BTRIM(p_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'staff_role_name_required';
  END IF;
  IF p_description IS NOT NULL AND char_length(BTRIM(p_description)) > 1000 THEN
    RAISE EXCEPTION 'staff_role_description_too_long';
  END IF;
  IF p_active IS NULL THEN RAISE EXCEPTION 'staff_role_active_required'; END IF;

  SELECT * INTO v_role
    FROM public.staff_roles
   WHERE id = p_role_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'staff_role_not_found'; END IF;
  IF v_role.is_system THEN RAISE EXCEPTION 'system_role_protected'; END IF;

  v_module_keys := public.validate_staff_module_keys(p_module_keys);
  SELECT COALESCE(array_agg(module_row.key ORDER BY module_row.key), ARRAY[]::TEXT[])
    INTO v_before_module_keys
    FROM public.staff_role_modules AS role_module
    JOIN public.staff_modules AS module_row ON module_row.id = role_module.module_id
   WHERE role_module.role_id = p_role_id;

  UPDATE public.staff_roles
     SET name = BTRIM(p_name),
         description = NULLIF(BTRIM(p_description), ''),
         is_active = p_active,
         updated_at = now()
   WHERE id = p_role_id;

  DELETE FROM public.staff_role_modules WHERE role_id = p_role_id;
  INSERT INTO public.staff_role_modules (role_id, module_id)
  SELECT p_role_id, module_row.id
    FROM public.staff_modules AS module_row
   WHERE module_row.key = ANY(v_module_keys);

  PERFORM public.sync_staff_role_permissions(p_role_id);
  SELECT COALESCE(array_agg(permission.key ORDER BY permission.key), ARRAY[]::TEXT[])
    INTO v_permission_keys
    FROM public.staff_role_permissions AS role_permission
    JOIN public.staff_permissions AS permission ON permission.id = role_permission.permission_id
   WHERE role_permission.role_id = p_role_id;

  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, before_data, after_data, note
  ) VALUES (
    v_actor,
    'staff.role.updated',
    'staff_role',
    p_role_id,
    jsonb_build_object('moduleKeys', v_before_module_keys, 'isActive', v_role.is_active),
    jsonb_build_object(
      'moduleKeys', v_module_keys,
      'permissionKeys', v_permission_keys,
      'isActive', p_active
    ),
    BTRIM(p_reason)
  );
END;
$$;

-- Replace hardcoded legacy permission lists with database relationships.
CREATE OR REPLACE FUNCTION public.has_staff_permission(
  p_user_id UUID,
  p_permission_key TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL
     OR p_permission_key IS NULL
     OR (
       COALESCE(auth.role(), '') <> 'service_role'
       AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid())
     ) THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.staff_permissions WHERE key = p_permission_key
  ) THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users AS user_row
     WHERE user_row.id = p_user_id AND user_row.status = 'active'
  ) THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.user_roles AS coarse_assignment
      JOIN public.roles AS coarse_role ON coarse_role.id = coarse_assignment.role_id
     WHERE coarse_assignment.user_id = p_user_id
       AND coarse_assignment.vendor_id IS NULL
       AND coarse_assignment.outlet_id IS NULL
       AND coarse_role.name IN ('admin', 'approver', 'super_admin', 'staff')
  ) THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.user_roles AS coarse_assignment
      JOIN public.roles AS coarse_role ON coarse_role.id = coarse_assignment.role_id
     WHERE coarse_assignment.user_id = p_user_id
       AND coarse_assignment.vendor_id IS NULL
       AND coarse_assignment.outlet_id IS NULL
       AND coarse_role.name = 'super_admin'
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.staff_role_assignments AS role_assignment
      JOIN public.staff_roles AS staff_role
        ON staff_role.id = role_assignment.role_id
       AND staff_role.is_active = TRUE
      JOIN public.staff_role_modules AS role_module
        ON role_module.role_id = staff_role.id
      JOIN public.staff_modules AS module_row
        ON module_row.id = role_module.module_id
       AND module_row.is_active = TRUE
      JOIN public.staff_module_permissions AS module_permission
        ON module_permission.module_id = module_row.id
      JOIN public.staff_permissions AS permission
        ON permission.id = module_permission.permission_id
     WHERE role_assignment.user_id = p_user_id
       AND role_assignment.revoked_at IS NULL
       AND permission.key = p_permission_key
    UNION ALL
    SELECT 1
      FROM public.user_roles AS coarse_assignment
      JOIN public.roles AS coarse_role ON coarse_role.id = coarse_assignment.role_id
      JOIN public.staff_module_legacy_roles AS legacy_module
        ON legacy_module.role_name = coarse_role.name
       AND legacy_module.grants_permissions = TRUE
      JOIN public.staff_modules AS module_row
        ON module_row.id = legacy_module.module_id
       AND module_row.is_active = TRUE
      JOIN public.staff_module_permissions AS module_permission
        ON module_permission.module_id = module_row.id
      JOIN public.staff_permissions AS permission
        ON permission.id = module_permission.permission_id
     WHERE coarse_assignment.user_id = p_user_id
       AND coarse_assignment.vendor_id IS NULL
       AND coarse_assignment.outlet_id IS NULL
       AND permission.key = p_permission_key
  );
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_staff_access()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  WITH actor AS (
    SELECT auth.uid() AS user_id
  ), coarse_roles AS (
    SELECT DISTINCT coarse_role.name
      FROM actor
      JOIN public.user_roles AS assignment ON assignment.user_id = actor.user_id
      JOIN public.roles AS coarse_role ON coarse_role.id = assignment.role_id
     WHERE assignment.vendor_id IS NULL
       AND assignment.outlet_id IS NULL
       AND coarse_role.name IN ('admin', 'approver', 'super_admin', 'staff')
  ), active_assignments AS (
    SELECT staff_role.id, staff_role.name
      FROM actor
      JOIN public.staff_role_assignments AS assignment ON assignment.user_id = actor.user_id
      JOIN public.staff_roles AS staff_role ON staff_role.id = assignment.role_id
     WHERE assignment.revoked_at IS NULL
       AND staff_role.is_active = TRUE
  ), effective_module_ids AS (
    SELECT role_module.module_id
      FROM active_assignments AS active_assignment
      JOIN public.staff_role_modules AS role_module ON role_module.role_id = active_assignment.id
    UNION
    SELECT legacy_module.module_id
      FROM coarse_roles AS coarse_role
      JOIN public.staff_module_legacy_roles AS legacy_module
        ON legacy_module.role_name = coarse_role.name
    UNION
    SELECT module_row.id
      FROM public.staff_modules AS module_row
     WHERE EXISTS (SELECT 1 FROM coarse_roles WHERE name = 'super_admin')
  ), effective_permissions AS (
    SELECT permission.key
      FROM public.staff_permissions AS permission, actor
     WHERE public.has_staff_permission(actor.user_id, permission.key)
  ), module_rows AS (
    SELECT
      module_row.*,
      module_group.key AS group_key,
      module_group.name AS group_name,
      COALESCE((
        SELECT jsonb_agg(permission.key ORDER BY permission.key)
          FROM public.staff_module_permissions AS module_permission
          JOIN public.staff_permissions AS permission
            ON permission.id = module_permission.permission_id
         WHERE module_permission.module_id = module_row.id
      ), '[]'::JSONB) AS permission_keys
      FROM effective_module_ids AS effective
      JOIN public.staff_modules AS module_row
        ON module_row.id = effective.module_id
       AND module_row.is_active = TRUE
      LEFT JOIN public.staff_module_group_members AS group_member
        ON group_member.module_id = module_row.id
      LEFT JOIN public.staff_module_groups AS module_group
        ON module_group.id = group_member.group_id
       AND module_group.is_active = TRUE
  )
  SELECT jsonb_build_object(
    'roleNames', COALESCE((
      SELECT jsonb_agg(name ORDER BY name) FROM active_assignments
    ), '[]'::JSONB),
    'permissionKeys', COALESCE((
      SELECT jsonb_agg(key ORDER BY key) FROM effective_permissions
    ), '[]'::JSONB),
    'modules', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'key', key,
          'label', label,
          'labelKey', label_key,
          'description', description,
          'sectionKey', section_key,
          'sectionLabel', section_label,
          'sectionLabelKey', section_label_key,
          'sectionSortOrder', section_sort_order,
          'href', href,
          'iconKey', icon_key,
          'sortOrder', sort_order,
          'groupKey', group_key,
          'groupName', group_name,
          'permissionKeys', permission_keys
        ) ORDER BY section_sort_order, sort_order, key
      ) FROM module_rows
    ), '[]'::JSONB)
  )
  WHERE auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM coarse_roles);
$$;

ALTER TABLE public.staff_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_module_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_role_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_module_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_module_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_module_legacy_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_modules_super_admin_read ON public.staff_modules;
CREATE POLICY staff_modules_super_admin_read ON public.staff_modules
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS staff_module_permissions_super_admin_read ON public.staff_module_permissions;
CREATE POLICY staff_module_permissions_super_admin_read ON public.staff_module_permissions
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS staff_role_modules_super_admin_read ON public.staff_role_modules;
CREATE POLICY staff_role_modules_super_admin_read ON public.staff_role_modules
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS staff_module_groups_super_admin_read ON public.staff_module_groups;
CREATE POLICY staff_module_groups_super_admin_read ON public.staff_module_groups
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS staff_module_group_members_super_admin_read ON public.staff_module_group_members;
CREATE POLICY staff_module_group_members_super_admin_read ON public.staff_module_group_members
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));
DROP POLICY IF EXISTS staff_module_legacy_roles_super_admin_read ON public.staff_module_legacy_roles;
CREATE POLICY staff_module_legacy_roles_super_admin_read ON public.staff_module_legacy_roles
  FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

REVOKE ALL ON TABLE public.staff_modules FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.staff_module_permissions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.staff_role_modules FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.staff_module_groups FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.staff_module_group_members FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.staff_module_legacy_roles FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.staff_modules, public.staff_module_permissions,
  public.staff_role_modules, public.staff_module_groups,
  public.staff_module_group_members, public.staff_module_legacy_roles
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.validate_staff_module_keys(TEXT[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_staff_role_permissions(UUID) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_staff_module(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT[], TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_staff_module(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT[], TEXT, TEXT
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_staff_module(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT[], TEXT, BOOLEAN, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_staff_module(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, TEXT, INTEGER, TEXT[], TEXT, BOOLEAN, TEXT
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_staff_role_with_modules(TEXT, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_staff_role_with_modules(TEXT, TEXT, TEXT[], TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_staff_role_with_modules(UUID, TEXT, TEXT, TEXT[], BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_staff_role_with_modules(UUID, TEXT, TEXT, TEXT[], BOOLEAN, TEXT) TO authenticated, service_role;

-- Browser callers must use Module-aware role writes so atomic groups cannot be
-- bypassed by directly submitting raw permission arrays to the legacy RPCs.
REVOKE ALL ON FUNCTION public.create_staff_role(TEXT, TEXT, TEXT[], TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.update_staff_role(UUID, TEXT, TEXT, TEXT[], BOOLEAN, TEXT) FROM authenticated;

REVOKE ALL ON FUNCTION public.get_my_staff_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_staff_access() TO authenticated;

NOTIFY pgrst, 'reload schema';
