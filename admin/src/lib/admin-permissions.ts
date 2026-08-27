/**
 * Client-side permission helpers — mirrors backend domain:action semantics.
 * Super Admin with empty permissions[] has FULL access (never treat empty as deny).
 * `manage` does NOT imply `view`.
 */

export type PermissionSubject = {
  isSuperAdmin?: boolean;
  permissions?: string[] | null;
} | null | undefined;

export function formatPermissionKey(domain: string, action: string): string {
  return `${domain}:${action}`;
}

export function hasPermission(
  user: PermissionSubject,
  domain: string,
  action: string,
): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const key = formatPermissionKey(domain, action);
  return (user.permissions ?? []).includes(key);
}

/** True when Super Admin or staff has at least one assigned permission key. */
export function hasAssignedAdminPermissions(user: PermissionSubject): boolean {
  return (
    Boolean(user?.isSuperAdmin) ||
    (Array.isArray(user?.permissions) && user.permissions.length > 0)
  );
}
