import { handleTngPayoutWebhook } from '@/lib/payouts/tng-webhook-handler';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  return handleTngPayoutWebhook(request);
}
