import { POST as runMaintenance } from '@/app/api/internal/wallet-maintenance/route';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return runMaintenance(new Request(request.url, {
    method: 'POST',
    headers: request.headers,
  }));
}
