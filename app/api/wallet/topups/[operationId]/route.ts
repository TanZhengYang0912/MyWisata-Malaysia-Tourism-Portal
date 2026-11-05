import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { parseBody, databaseUuidSchema } from '@/lib/validation/schemas';
import { cancelWalletTopUp, getWalletTopUp } from '@/lib/wallet/topup-operations';

export const dynamic = 'force-dynamic';
type RouteContext = { params: Promise<{ operationId: string }> };

function privateJson(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

async function ownerId() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  return !error && user && !user.is_anonymous ? user.id : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const userId = await ownerId();
  if (!userId) return privateJson({ error: 'Sign in required' }, 401);
  const { operationId } = await context.params;
  if (!databaseUuidSchema.safeParse(operationId).success) return privateJson({ error: 'Top-up not found' }, 404);
  try {
    const operation = await getWalletTopUp(userId, operationId);
    return operation ? privateJson(operation) : privateJson({ error: 'Top-up not found' }, 404);
  } catch {
    return privateJson({ error: 'Unable to check this top-up yet' }, 503);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const userId = await ownerId();
  if (!userId) return privateJson({ error: 'Sign in required' }, 401);
  const { operationId } = await context.params;
  if (!databaseUuidSchema.safeParse(operationId).success) return privateJson({ error: 'Top-up not found' }, 404);
  const parsed = await parseBody(request, z.object({ action: z.literal('cancel') }).strict(), { maxBytes: 1024 });
  if (!parsed.ok) return privateJson(await parsed.response.json(), parsed.response.status);
  try {
    const operation = await cancelWalletTopUp(userId, operationId);
    return operation ? privateJson(operation) : privateJson({ error: 'Top-up not found' }, 404);
  } catch {
    return privateJson({ error: 'Unable to check this top-up yet' }, 503);
  }
}
