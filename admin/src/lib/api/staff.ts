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
  actions: Array<{ id: string; label: string }>;
};

const HIDDEN_STAFF_DOMAINS = new Set(["sellers", "finance"]);

export async function fetchStaffUsers(): Promise<StaffUser[]> {
  const response = await apiRequest<{ data?: { users?: StaffUser[] } }>("/api/admin/users");
  return unwrapData(response)?.users ?? [];
}

export async function fetchPermissionCatalog(): Promise<PermissionDomain[]> {
  const response = await apiRequest<{ data?: { catalog?: PermissionDomain[] } }>(
    "/api/admin/permissions/catalog",
  );
  const catalog = unwrapData(response)?.catalog ?? [];
  return catalog.filter((domain) => !HIDDEN_STAFF_DOMAINS.has(domain.id));
}

export async function createStaffUser(input: {
  name: string;
  username: string;
  email: string;
  password: string;
  permissions: string[];
}): Promise<void> {
  await apiRequest("/api/admin/users", { method: "POST", body: input });
}

export async function updateStaffUser(
  id: string,
  input: { isActive?: boolean; permissions?: string[] },
): Promise<void> {
  await apiRequest(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: input,
  });
}
