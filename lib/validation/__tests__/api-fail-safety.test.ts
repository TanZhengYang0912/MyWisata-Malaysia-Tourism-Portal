import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFail } from "../schemas";

describe("apiFail public error boundary", () => {
  afterEach(() => vi.restoreAllMocks());

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

  it("attaches a generated request ID to server failures and logs only safe correlation fields", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = apiFail("SERVER_ERROR", "Unable to complete this request", 503, { token: "private" });
    const body = await response.json();
    const requestId = body.error.requestId as string;

    expect(requestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(JSON.parse(String(log.mock.calls[0][0]))).toMatchObject({
      level: "error", message: "api_failure", requestId, code: "SERVER_ERROR",
    });
    expect(String(log.mock.calls[0][0])).not.toContain("private");
  });

  it("preserves a safe supplied request ID and omits IDs from client errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const supplied = apiFail("SERVER_ERROR", "Unavailable", 500, undefined, { requestId: "vercel-edge:abc123" });
    const suppliedBody = await supplied.json();
    expect(suppliedBody.error.requestId).toBe("vercel-edge:abc123");
    expect(supplied.headers.get("x-request-id")).toBe("vercel-edge:abc123");

    const clientError = apiFail("INVALID_QUERY", "Invalid query", 400);
    const clientBody = await clientError.json();
    expect(clientBody.error.requestId).toBeUndefined();
    expect(clientError.headers.get("x-request-id")).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
  });
});
