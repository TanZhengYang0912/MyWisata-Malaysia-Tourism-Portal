type ApiErrorBody = {
  error?: { message?: unknown } | null;
} | null | undefined;

export function getUserManagementErrorMessage(body: unknown, fallback: string): string {
  const message = (body as ApiErrorBody)?.error?.message;
  return typeof message === "string" && message.trim().length > 0 ? message : fallback;
}
