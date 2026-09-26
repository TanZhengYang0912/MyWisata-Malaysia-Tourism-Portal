-- Give Admin staff an explicit, read-only bridge to customer order records.
INSERT INTO public.staff_permissions (key, module, action, description, is_system)
VALUES ('admin.orders.read', 'admin', 'orders.read', 'Read order, payment and fulfilment summaries', TRUE)
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
  'orders', 'Orders', 'navigation.Orders', 'Read customer orders, payments and fulfilment status',
  'operations', 'Operations', 'navigationSections.operations', 25,
  '/admin/orders', 'package', 10, TRUE
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
  JOIN public.staff_permissions AS permission ON permission.key = 'admin.orders.read'
 WHERE module_row.key = 'orders'
ON CONFLICT (module_id, permission_id) DO NOTHING;

-- Preserve the existing global Admin experience. Custom staff roles can opt in
-- through the existing Access Control module assignment flow.
INSERT INTO public.staff_role_permissions (role_id, permission_id)
SELECT role_row.id, permission.id
  FROM public.staff_roles AS role_row
  JOIN public.staff_permissions AS permission ON permission.key = 'admin.orders.read'
 WHERE role_row.name = 'Legacy Admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.staff_role_modules (role_id, module_id)
SELECT role_row.id, module_row.id
  FROM public.staff_roles AS role_row
  JOIN public.staff_modules AS module_row ON module_row.key = 'orders'
 WHERE role_row.name = 'Legacy Admin'
ON CONFLICT (role_id, module_id) DO NOTHING;

INSERT INTO public.staff_module_legacy_roles (module_id, role_name, grants_permissions)
SELECT module_row.id, 'admin', TRUE
  FROM public.staff_modules AS module_row
 WHERE module_row.key = 'orders'
ON CONFLICT (module_id, role_name) DO UPDATE SET grants_permissions = TRUE;
