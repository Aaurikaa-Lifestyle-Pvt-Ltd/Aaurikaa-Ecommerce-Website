import { apiRequest, unwrapData } from "./client";

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

const HIDDEN_STAFF_DOMAINS = new Set(["sellers", "finance"]);

export async function fetchStaffUsers(): Promise<StaffUser[]> {
  const response = await apiRequest<{ data?: { users?: StaffUser[] } }>("/api/admin/users");
  return unwrapData(response)?.users ?? [];
}

export async function fetchPermissionCatalog(): Promise<PermissionCatalogForUi> {
  const response = await apiRequest<{
    data?: {
      catalog?: PermissionDomain[];
      groups?: PermissionUiGroup[];
      suggestedDisplayLabels?: string[];
    };
  }>("/api/admin/permissions/catalog");
  const data = unwrapData(response) ?? {};
  const catalog = (data.catalog ?? []).filter((domain) => !HIDDEN_STAFF_DOMAINS.has(domain.id));
  const catalogIds = new Set(catalog.map((d) => d.id));
  const groups = (data.groups ?? [])
    .map((group) => ({
      ...group,
      domains: group.domains.filter((id) => !HIDDEN_STAFF_DOMAINS.has(id) && catalogIds.has(id)),
    }))
    .filter((group) => group.domains.length > 0);

  return {
    catalog,
    groups,
    suggestedDisplayLabels: data.suggestedDisplayLabels ?? [],
  };
}

export async function createStaffUser(input: {
  name: string;
  username: string;
  email: string;
  password: string;
  permissions: string[];
  displayLabel?: string;
}): Promise<void> {
  await apiRequest("/api/admin/users", { method: "POST", body: input });
}

export async function updateStaffUser(
  id: string,
  input: { isActive?: boolean; permissions?: string[]; displayLabel?: string | null },
): Promise<void> {
  await apiRequest(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
  });
}
