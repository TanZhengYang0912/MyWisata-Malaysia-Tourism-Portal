-- Internal tables are accessed through existing, permission-checked
-- SECURITY DEFINER functions. Deny direct row access as defense in depth;
-- retain owner access for those functions without adding client policies.
SET LOCAL lock_timeout = '5s';

ALTER TABLE app_private.affiliate_job_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.guest_contact_corrections ENABLE ROW LEVEL SECURITY;
