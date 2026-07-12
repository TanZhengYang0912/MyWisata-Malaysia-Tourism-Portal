import type { User } from "@/backend/core/types";

const CURRENT_USER_KEY = "tp_current_user_id";
const CURRENT_USER_DATA_KEY = "tp_current_user_data";

export function getCurrentUserId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CURRENT_USER_KEY);
}

export function setCurrentUserId(id: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CURRENT_USER_KEY, id);
}

export function setCurrentUser(user: User): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CURRENT_USER_KEY, user.id);
  window.localStorage.setItem(CURRENT_USER_DATA_KEY, JSON.stringify(user));
}

export function getStoredCurrentUser(id: string): User | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(CURRENT_USER_DATA_KEY);
  if (!raw) return null;
  try {
    const stored = JSON.parse(raw) as User;
    return stored.id === id ? stored : null;
  } catch {
    return null;
  }
}
