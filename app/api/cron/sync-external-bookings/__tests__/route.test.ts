import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

describe("POST /api/cron/sync-external-bookings", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed when the cron secret is missing", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const response = await POST(new Request("http://localhost/api/cron/sync-external-bookings", { method: "POST" }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "External booking sync is not configured" });
  });

  it("rejects an incorrect cron secret", async () => {
    vi.stubEnv("CRON_SECRET", "configured-secret");
    const response = await POST(new Request("http://localhost/api/cron/sync-external-bookings", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    }));
    expect(response.status).toBe(401);
  });

  it("does not drain the outbox until a real outbound adapter is configured", async () => {
    vi.stubEnv("CRON_SECRET", "configured-secret");
    const response = await POST(new Request("http://localhost/api/cron/sync-external-bookings", {
      method: "POST",
      headers: { authorization: "Bearer configured-secret" },
    }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "External booking dispatcher is not configured" });
  });
});
