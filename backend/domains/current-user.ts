const CURRENT_USER_KEY = "tp_current_user_id";

export function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CURRENT_USER_KEY);
}

export function setCurrentUserId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CURRENT_USER_KEY, id);
}
