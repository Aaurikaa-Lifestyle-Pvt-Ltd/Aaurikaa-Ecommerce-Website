/**
 * Staff UI presentation helpers — labels and summaries only.
 * Does not invent roles/permissions; maps existing catalog keys for display.
 */

import {
  isHiddenStaffPermissionKey,
  type PermissionDomain,
  type StaffUser,
} from "./staff-catalog.ts";

export type PermissionLookup = {
  domainLabel: string;
  actionLabel: string;
};

/** Build domain:action → human labels from the assignable catalog. */
export function buildPermissionLookup(
  catalog: PermissionDomain[],
): Map<string, PermissionLookup> {
  const map = new Map<string, PermissionLookup>();
  for (const domain of catalog) {
    for (const action of domain.actions) {
      map.set(`${domain.id}:${action.id}`, {
        domainLabel: domain.label,
        actionLabel: action.label,
      });
    }
  }
  return map;
}

export function staffRoleLabel(user: StaffUser): string {
  if (user.isSuperAdmin) return "Super Admin";
  const label = user.displayLabel?.trim();
  return label || "Staff";
}

export function staffIsActive(user: StaffUser): boolean {
  return user.isActive !== false;
}

/** Permission keys safe to show in AAURIKAA Staff UI (excludes marketplace domains). */
export function visibleStaffPermissionKeys(keys: string[] | undefined | null): string[] {
  return (keys ?? []).filter((key) => !isHiddenStaffPermissionKey(key));
}

/**
 * Compact access summary for the staff list.
 * Groups by domain label using catalog action labels — never raw keys when catalog is available.
 */
export function summarizeStaffAccess(
  user: StaffUser,
  catalog: PermissionDomain[],
  options?: { maxDomains?: number },
): {
  kind: "full" | "none" | "domains";
  lines: string[];
  remainingDomains: number;
} {
  if (user.isSuperAdmin) {
    return { kind: "full", lines: ["Full access"], remainingDomains: 0 };
  }

  const lookup = buildPermissionLookup(catalog);
  const keys = visibleStaffPermissionKeys(user.permissions);
  if (keys.length === 0) {
    return { kind: "none", lines: ["No permissions"], remainingDomains: 0 };
  }

  const byDomain = new Map<string, string[]>();
  const domainOrder: string[] = [];

  for (const key of keys) {
    const entry = lookup.get(key);
    const domainLabel = entry?.domainLabel ?? humanizePermissionDomain(key);
    const actionLabel = entry?.actionLabel ?? humanizePermissionAction(key);
    if (!byDomain.has(domainLabel)) {
      byDomain.set(domainLabel, []);
      domainOrder.push(domainLabel);
    }
    const actions = byDomain.get(domainLabel)!;
    if (!actions.includes(actionLabel)) actions.push(actionLabel);
  }

  const maxDomains = options?.maxDomains ?? 4;
  const shown = domainOrder.slice(0, maxDomains);
  const remainingDomains = Math.max(0, domainOrder.length - shown.length);

  return {
    kind: "domains",
    lines: shown.map((domain) => {
      const actions = byDomain.get(domain) ?? [];
      return `${domain}: ${actions.join(", ")}`;
    }),
    remainingDomains,
  };
}

function humanizePermissionDomain(key: string): string {
  const domain = key.split(":")[0] ?? key;
  return domain
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function humanizePermissionAction(key: string): string {
  const action = key.split(":")[1] ?? key;
  return action.charAt(0).toUpperCase() + action.slice(1);
}

/**
 * On save: keep any marketplace/hidden keys already on the account so UI filtering
 * never strips backend-only capabilities the Super Admin cannot see here.
 */
export function mergePreservedHiddenPermissions(
  nextVisible: string[],
  previous: string[] | undefined | null,
): string[] {
  const visible = visibleStaffPermissionKeys(nextVisible);
  const preserved = (previous ?? []).filter(isHiddenStaffPermissionKey);
  return [...new Set([...visible, ...preserved])];
}
