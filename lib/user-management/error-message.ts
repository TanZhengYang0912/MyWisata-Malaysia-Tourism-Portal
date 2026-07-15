type ApiErrorBody = {
  error?: { message?: unknown; details?: { fieldErrors?: Record<string, unknown> } | null } | null;
} | null | undefined;

export function getUserManagementErrorMessage(body: unknown, fallback: string): string {
  const error = (body as ApiErrorBody)?.error;
  const message = error?.message;
  const base = typeof message === "string" && message.trim().length > 0 ? message : fallback;
  const fieldErrors = error?.details?.fieldErrors;
  if (!fieldErrors) return base;

  const firstError = Object.entries(fieldErrors).find(([, values]) => Array.isArray(values) && values.length > 0);
  if (!firstError) return base;
  const [field, values] = firstError;
  const detail = values[0];
  return typeof detail === "string" && detail.trim().length > 0 ? `${base} (${field}: ${detail})` : base;
}
