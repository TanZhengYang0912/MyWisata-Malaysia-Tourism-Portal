type AdminIdentity = {
  fullName?: string | null;
  displayName?: string | null;
  email?: string | null;
};

export function getAdminUserLabel(user: AdminIdentity): string {
  const fullName = user.fullName?.trim();
  const displayName = user.displayName?.trim();
  if (fullName) return fullName;
  if (displayName) return displayName;

  const localPart = user.email?.split("@")[0]?.trim();
  return localPart || "User";
}

export function hasAdminDisplayName(user: AdminIdentity): boolean {
  return Boolean(user.fullName?.trim() || user.displayName?.trim());
}

export function getAdminUserInitial(user: AdminIdentity): string {
  return getAdminUserLabel(user).charAt(0).toUpperCase();
}
