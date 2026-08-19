import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ settleSimulatorEvent: vi.fn() }));
vi.mock('@/lib/payments/settle-simulator-event', () => ({ settleSimulatorEvent: mocks.settleSimulatorEvent }));

import { POST } from '../route';

function request(signature = 'a'.repeat(64)) {
  return new Request('http://localhost/api/payments/simulator/webhook', {
    method: 'POST',
    headers: { 'x-mywisata-simulator-signature': signature },
    body: JSON.stringify({ kind: 'payment' }),
  });
}

describe('POST /api/payments/simulator/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYMENT_SIMULATOR_MODE', 'enabled');
    vi.stubEnv('PAYMENT_SIMULATOR_WEBHOOK_SECRET', 'route-test-secret');
    mocks.settleSimulatorEvent.mockResolvedValue({ kind: 'payment', status: 'paid', idempotent: false });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('passes the exact raw body and signature to the shared settlement boundary', async () => {
    const req = request();
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mocks.settleSimulatorEvent).toHaveBeenCalledWith(JSON.stringify({ kind: 'payment' }), 'a'.repeat(64));
    await expect(response.json()).resolves.toEqual({
      received: true,
      kind: 'payment',
      status: 'paid',
      idempotent: false,
    });
  });

  it('returns not found when the simulator is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mocks.settleSimulatorEvent).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid_simulator_webhook_signature', 401],
    ['invalid_payment_simulator_webhook_payload', 400],
    ['provider_event_conflict', 409],
  ])('maps %s to a safe HTTP status', async (message, status) => {
    mocks.settleSimulatorEvent.mockRejectedValue(new Error(message));
    const response = await POST(request());

    expect(response.status).toBe(status);
    expect(JSON.stringify(await response.json())).not.toContain('route-test-secret');
  });
});
