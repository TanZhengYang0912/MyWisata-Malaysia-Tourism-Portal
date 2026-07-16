/**
 * Extract the user-facing message from the standard API response envelope.
 * Keep a local fallback because network/proxy failures may not return JSON.
 */
export function apiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;

  const record = body as { error?: unknown; message?: unknown };
  if (typeof record.message === "string" && record.message.trim()) return record.message;

  if (record.error && typeof record.error === "object") {
    const message = (record.error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  if (typeof record.error === "string" && record.error.trim()) return record.error;
  return fallback;
}
