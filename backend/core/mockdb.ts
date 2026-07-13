export function resetDemo(): void {
  if (typeof window !== "undefined") window.location.href = "/login";
}
