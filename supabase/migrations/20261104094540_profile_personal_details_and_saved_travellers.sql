-- Optional private profile details and reusable participant data. No public projections.
SET lock_timeout = '5s';
CREATE TABLE public.profile_personal_details (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  legal_name text CHECK (legal_name IS NULL OR (char_length(btrim(legal_name)) BETWEEN 2 AND 100 AND legal_name = btrim(legal_name))),
  date_of_birth date CHECK (date_of_birth BETWEEN DATE '1900-01-01' AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuala_Lumpur')::date),
  gender text CHECK (gender IN ('female', 'male', 'other', 'prefer_not_to_say')),
  nationality_code text CHECK (nationality_code IN ('AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW')),
  emergency_contact_name text CHECK (emergency_contact_name IS NULL OR char_length(btrim(emergency_contact_name)) BETWEEN 2 AND 100),
  emergency_contact_relationship text CHECK (emergency_contact_relationship IS NULL OR char_length(emergency_contact_relationship) <= 50),
  emergency_contact_phone text CHECK (emergency_contact_phone IS NULL OR emergency_contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((emergency_contact_name IS NULL AND emergency_contact_phone IS NULL AND emergency_contact_relationship IS NULL)
    OR (emergency_contact_name IS NOT NULL AND emergency_contact_phone IS NOT NULL))
);
CREATE TABLE public.saved_travellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  contact_phone text CHECK (contact_phone IS NULL OR contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  relationship text CHECK (relationship IS NULL OR char_length(relationship) <= 50),
  legal_name text CHECK (legal_name IS NULL OR (char_length(btrim(legal_name)) BETWEEN 2 AND 100 AND legal_name = btrim(legal_name))),
  date_of_birth date CHECK (date_of_birth BETWEEN DATE '1900-01-01' AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuala_Lumpur')::date),
  gender text CHECK (gender IN ('female', 'male', 'other', 'prefer_not_to_say')),
  nationality_code text CHECK (nationality_code IN ('AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW')),
  emergency_contact_name text CHECK (emergency_contact_name IS NULL OR char_length(btrim(emergency_contact_name)) BETWEEN 2 AND 100),
  emergency_contact_relationship text CHECK (emergency_contact_relationship IS NULL OR char_length(emergency_contact_relationship) <= 50),
  emergency_contact_phone text CHECK (emergency_contact_phone IS NULL OR emergency_contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((emergency_contact_name IS NULL AND emergency_contact_phone IS NULL AND emergency_contact_relationship IS NULL)
    OR (emergency_contact_name IS NOT NULL AND emergency_contact_phone IS NOT NULL))
);
ALTER TABLE public.saved_travellers ALTER COLUMN legal_name SET NOT NULL;
CREATE INDEX saved_travellers_owner_created_idx ON public.saved_travellers (user_id, created_at DESC, id DESC);

CREATE FUNCTION public.touch_travel_details_updated_at() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.touch_travel_details_updated_at() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.profile_personal_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profile_personal_details FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.profile_personal_details TO authenticated;
GRANT INSERT (user_id, legal_name, date_of_birth, gender, nationality_code, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone) ON public.profile_personal_details TO authenticated;
GRANT UPDATE (user_id, legal_name, date_of_birth, gender, nationality_code, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone) ON public.profile_personal_details TO authenticated;
GRANT ALL ON public.profile_personal_details TO service_role;
CREATE POLICY profile_personal_details_select_owner ON public.profile_personal_details FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) AND NOT coalesce((SELECT auth.jwt()->>'is_anonymous')::boolean, false) AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.status = 'active'));
CREATE POLICY profile_personal_details_insert_owner ON public.profile_personal_details FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) AND NOT coalesce((SELECT auth.jwt()->>'is_anonymous')::boolean, false) AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.status = 'active'));
CREATE POLICY profile_personal_details_update_owner ON public.profile_personal_details FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()) AND NOT coalesce((SELECT auth.jwt()->>'is_anonymous')::boolean, false) AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.status = 'active')) WITH CHECK (user_id = (SELECT auth.uid()) AND NOT coalesce((SELECT auth.jwt()->>'is_anonymous')::boolean, false) AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.status = 'active'));
CREATE POLICY profile_personal_details_delete_owner ON public.profile_personal_details FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()) AND NOT coalesce((SELECT auth.jwt()->>'is_anonymous')::boolean, false) AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.status = 'active'));
CREATE TRIGGER profile_personal_details_updated BEFORE UPDATE ON public.profile_personal_details FOR EACH ROW EXECUTE FUNCTION public.touch_travel_details_updated_at();
COMMENT ON TABLE public.profile_personal_details IS 'Private owner-managed self-declared data; not verified identity, insurance authorization, or an order snapshot. Soft closure retains rows for account restoration; physical user deletion cascades.';

ALTER TABLE public.saved_travellers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saved_travellers FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.saved_travellers TO authenticated;
GRANT INSERT (user_id, legal_name, date_of_birth, gender, nationality_code, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, contact_phone, relationship) ON public.saved_travellers TO authenticated;
GRANT UPDATE (legal_name, date_of_birth, gender, nationality_code, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone, contact_phone, relationship) ON public.saved_travellers TO authenticated;
GRANT ALL ON public.saved_travellers TO service_role;
CREATE POLICY saved_travellers_select_owner ON public.saved_travellers FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) AND NOT coalesce((SELECT auth.jwt()->>'is_anonymous')::boolean, false) AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.status = 'active'));
CREATE POLICY saved_travellers_insert_owner ON public.saved_travellers FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) AND NOT coalesce((SELECT auth.jwt()->>'is_anonymous')::boolean, false) AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.status = 'active'));
CREATE POLICY saved_travellers_update_owner ON public.saved_travellers FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()) AND NOT coalesce((SELECT auth.jwt()->>'is_anonymous')::boolean, false) AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.status = 'active')) WITH CHECK (user_id = (SELECT auth.uid()) AND NOT coalesce((SELECT auth.jwt()->>'is_anonymous')::boolean, false) AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.status = 'active'));
CREATE POLICY saved_travellers_delete_owner ON public.saved_travellers FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()) AND NOT coalesce((SELECT auth.jwt()->>'is_anonymous')::boolean, false) AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = (SELECT auth.uid()) AND u.status = 'active'));
CREATE TRIGGER saved_travellers_updated BEFORE UPDATE ON public.saved_travellers FOR EACH ROW EXECUTE FUNCTION public.touch_travel_details_updated_at();
COMMENT ON TABLE public.saved_travellers IS 'Private owner-managed self-declared data; not verified identity, insurance authorization, or an order snapshot. Soft closure retains rows for account restoration; physical user deletion cascades.';
