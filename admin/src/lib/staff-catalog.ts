/**
 * Staff permission catalog shaping for AAURIKAA Admin UI.
 * Pure helpers — no API client imports (safe for node:test).
 */

export type StaffUser = {
  id: string;
  name: string;
  username?: string;
  email: string;
  isSuperAdmin?: boolean;
  isActive?: boolean;
  permissions?: string[];
  displayLabel?: string | null;
};

export type PermissionDomain = {
  id: string;
  label: string;
  description?: string;
  actions: Array<{ id: string; label: string }>;
};

export type PermissionUiGroup = {
  id: string;
  label: string;
  domains: string[];
};

export type PermissionCatalogForUi = {
  catalog: PermissionDomain[];
  groups: PermissionUiGroup[];
  suggestedDisplayLabels: string[];
};

/** Marketplace-only domains — hidden from AAURIKAA Staff UI; not deleted from backend. */
export const HIDDEN_STAFF_DOMAINS = new Set(["sellers", "finance"]);

const MARKETPLACE_LABEL_PATTERN =
  /\b(seller|sellers|finance|commission|commissions|payout|payouts|marketplace|vendor|vendors)\b/i;

export function isHiddenStaffDomain(domainId: string): boolean {
  return HIDDEN_STAFF_DOMAINS.has(domainId);
}

export function isHiddenStaffPermissionKey(key: string): boolean {
  const domainId = key.split(":")[0] ?? "";
  return isHiddenStaffDomain(domainId);
}

/** Drop marketplace wording from optional role-label suggestions (display-only). */
export function filterStaffRoleSuggestions(labels: string[]): string[] {
  return labels.filter((label) => !MARKETPLACE_LABEL_PATTERN.test(label));
}

/**
 * Shape the assignable catalog for AAURIKAA Staff UI:
 * hide sellers/finance domains, drop empty groups, and retitle "Users & Vendors"
 * when only shoppers remain.
 */
export function shapePermissionCatalogForAaurikaa(input: {
  catalog?: PermissionDomain[];
  groups?: PermissionUiGroup[];
  suggestedDisplayLabels?: string[];
}): PermissionCatalogForUi {
  const catalog = (input.catalog ?? []).filter((domain) => !isHiddenStaffDomain(domain.id));
  const catalogIds = new Set(catalog.map((d) => d.id));
  const groups = (input.groups ?? [])
    .map((group) => {
      const domains = group.domains.filter(
        (id) => !isHiddenStaffDomain(id) && catalogIds.has(id),
      );
      if (domains.length === 0) return null;
      let label = group.label;
      if (group.id === "users" && !domains.includes("sellers")) {
        label = "Customers";
      }
      return { ...group, label, domains };
    })
    .filter((group): group is PermissionUiGroup => group != null);

  return {
    catalog,
    groups,
    suggestedDisplayLabels: filterStaffRoleSuggestions(input.suggestedDisplayLabels ?? []),
  };
}
