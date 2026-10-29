import { describe, expect, it } from "vitest";
import { apiFail } from "../schemas";

describe("apiFail public error boundary", () => {
  it("does not return internal database and permission diagnostics", async () => {
    const response = apiFail("DB_ERROR", 'new row violates row-level security policy for table "vendors"', 500, { detail: "internal" });
    const body = await response.json();

    expect(body.error.message).toBe("The request could not be completed. Please try again, or contact support if the problem continues.");
    expect(body.error.details).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("row-level security");
    expect(JSON.stringify(body)).not.toContain("vendors");
  });

  it("does not disclose provider configuration keys", async () => {
    const response = apiFail("AI_AUTHENTICATION_FAILED", "Update QWEN_API_KEY in .env.local and restart", 503);
    const body = await response.json();

    expect(JSON.stringify(body)).not.toContain("QWEN_API_KEY");
    expect(JSON.stringify(body)).not.toContain(".env.local");
  });
});
