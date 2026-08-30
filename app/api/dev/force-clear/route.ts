// Explicit local/staging test support only: force-clears pending affiliate
// commission without the production hold period. The real path is scheduled
// clearing and this route is fail-closed in production.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { clearMaturedCommissions } from '@/lib/affiliate/clearing';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';
import { isDemoToolRuntimeEnabled } from '@/lib/demo/runtime';

export async function POST() {
  if (!isDemoToolRuntimeEnabled()) return new Response(null, { status: 404 });

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(authClient, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can force-clear demo commissions', 403);
  }

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
