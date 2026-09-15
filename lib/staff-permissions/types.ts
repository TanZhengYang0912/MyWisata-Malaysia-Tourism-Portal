export type StaffPermissionKey = `${string}.${string}.${string}`;

export type StaffModule = {
  id: string;
  key: string;
  label: string;
  labelKey: string | null;
  description: string | null;
  sectionKey: string;
  sectionLabel: string;
  sectionLabelKey: string | null;
  sectionSortOrder: number;
  href: string;
  iconKey: string;
  sortOrder: number;
  groupKey: string | null;
  groupName: string | null;
  permissionKeys: StaffPermissionKey[];
};

const PERMISSION_KEY_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
const MODULE_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const ICON_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;

export function isStaffPermissionKey(value: string): value is StaffPermissionKey {
  return PERMISSION_KEY_PATTERN.test(value);
}

export function isStaffModuleKey(value: string): boolean {
  return MODULE_KEY_PATTERN.test(value);
}

function nullableString(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : undefined;
}

function parseStaffModule(value: unknown): StaffModule | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const labelKey = nullableString(row.labelKey);
  const description = nullableString(row.description);
  const sectionLabelKey = nullableString(row.sectionLabelKey);
  const groupKey = nullableString(row.groupKey);
  const groupName = nullableString(row.groupName);
  if (
    typeof row.id !== "string" || row.id.length === 0
    || typeof row.key !== "string" || !isStaffModuleKey(row.key)
    || typeof row.label !== "string" || row.label.trim().length === 0
    || labelKey === undefined || description === undefined
    || typeof row.sectionKey !== "string" || !isStaffModuleKey(row.sectionKey)
    || typeof row.sectionLabel !== "string" || row.sectionLabel.trim().length === 0
    || sectionLabelKey === undefined
    || typeof row.sectionSortOrder !== "number" || !Number.isInteger(row.sectionSortOrder)
    || typeof row.href !== "string" || !/^\/admin(?:\/.*)?$/.test(row.href) || /[?#]/.test(row.href)
    || typeof row.iconKey !== "string" || !ICON_KEY_PATTERN.test(row.iconKey)
    || typeof row.sortOrder !== "number" || !Number.isInteger(row.sortOrder)
    || groupKey === undefined || (groupKey !== null && !isStaffModuleKey(groupKey))
    || groupName === undefined
    || !Array.isArray(row.permissionKeys)
    || !row.permissionKeys.every((key) => typeof key === "string" && isStaffPermissionKey(key))
  ) return null;

  return {
    id: row.id,
    key: row.key,
    label: row.label.trim(),
    labelKey,
    description,
    sectionKey: row.sectionKey,
    sectionLabel: row.sectionLabel.trim(),
    sectionLabelKey,
    sectionSortOrder: row.sectionSortOrder,
    href: row.href,
    iconKey: row.iconKey,
    sortOrder: row.sortOrder,
    groupKey,
    groupName,
    permissionKeys: row.permissionKeys as StaffPermissionKey[],
  };
}

export function parseStaffModules(value: unknown): StaffModule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = parseStaffModule(item);
    return parsed ? [parsed] : [];
  });
}
