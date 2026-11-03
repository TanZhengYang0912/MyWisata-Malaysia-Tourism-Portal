import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk } from '@/lib/validation/schemas';

const noStore = (response: Response) => { response.headers.set('Cache-Control', 'private, no-store, max-age=0'); return response; };

export async function GET(_request: Request, { params }: { params: Promise<{ operationId: string }> }) {
  const { operationId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(operationId)) return noStore(apiFail('NOT_FOUND', 'Operation not found', 404));
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return noStore(apiFail('UNAUTHORIZED', 'Sign in required', 401));
  const { data, error } = await db.rpc('get_my_kyc_operation', { p_operation_id: operationId });
  if (error) return noStore(apiFail('OPERATION_UNAVAILABLE', 'Submission status could not be checked', 503));
  if (!data) return noStore(apiFail('NOT_FOUND', 'Operation not found', 404));
  const operation = data as { operationId: string; state: string; submissionId: string | null; submissionStatus: string | null; safeErrorCode: string | null; updatedAt: string };
  return noStore(apiOk({ operation: {
    id: operation.operationId,
    state: operation.state,
    submissionId: operation.submissionId,
    submissionStatus: operation.submissionStatus,
    updatedAt: operation.updatedAt,
  } }));
}
