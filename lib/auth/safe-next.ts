const DEFAULT_NEXT = "/customer/explore";

export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return DEFAULT_NEXT;
  return value;
}
