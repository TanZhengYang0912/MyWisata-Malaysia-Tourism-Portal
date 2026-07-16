type ApiErrorBody = {
  error?: { message?: unknown; details?: { fieldErrors?: Record<string, unknown> } | null } | null;
} | null | undefined;

export function getUserManagementErrorMessage(body: unknown, fallback: string): string {
  const error = (body as ApiErrorBody)?.error;
  const message = error?.message;
  const base = typeof message === "string" && message.trim().length > 0 ? message : fallback;
  const fieldErrors = error?.details?.fieldErrors;
  if (!fieldErrors) return base;

  for (const [field, values] of Object.entries(fieldErrors)) {
    if (!Array.isArray(values) || values.length === 0) continue;
    const detail = values[0];
    if (typeof detail === "string" && detail.trim().length > 0) {
      return `${base} (${field}: ${detail})`;
    }
  }
  return base;
}
