// P4 — DEV ONLY: force-clears every pending affiliate commission regardless
// of age. Nobody can wait 7 days in a demo. CLAUDE-PHASE2.md Feature D.
// Deleted at merge — never imply this is how clearing works in production
// (the real path is /api/admin/affiliate/run-clearing on a schedule).

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { clearMaturedCommissions } from '@/lib/affiliate/clearing';

export async function POST() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();

  const { data: setting } = await service
    .from('platform_settings')
    .select('value')
    .eq('key', 'demo.mode')
    .maybeSingle();
  if (setting?.value !== 'true') {
    return apiFail('FORBIDDEN', 'Demo mode is disabled', 403);
  }

  const result = await clearMaturedCommissions(service, { maxAgeDays: 0 });
  return apiOk(result);
}
