"use client";

export type AvatarUploadResult = { avatarUrl: string; changed: boolean; tier: string | null };

export async function uploadProfileAvatar(file: File): Promise<AvatarUploadResult> {
  const form = new FormData();
  form.set("file", file);
  const response = await fetch("/api/profile/avatar", { method: "POST", body: form });
  const payload = await response.json().catch(() => null) as {
    data?: AvatarUploadResult;
    error?: { code?: string };
  } | null;
  if (!response.ok || !payload?.data) throw new Error(payload?.error?.code ?? "AVATAR_SAVE_FAILED");
  return payload.data;
}
