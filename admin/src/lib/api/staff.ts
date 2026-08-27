import { apiRequest, unwrapData } from "./client";
import {
  shapePermissionCatalogForAaurikaa,
  type PermissionCatalogForUi,
  type PermissionDomain,
  type PermissionUiGroup,
  type StaffUser,
} from "../staff-catalog";

export type {
  PermissionCatalogForUi,
  PermissionDomain,
  PermissionUiGroup,
  StaffUser,
} from "../staff-catalog";

export {
  HIDDEN_STAFF_DOMAINS,
  filterStaffRoleSuggestions,
  isHiddenStaffDomain,
  isHiddenStaffPermissionKey,
  shapePermissionCatalogForAaurikaa,
} from "../staff-catalog";

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
  return shapePermissionCatalogForAaurikaa(unwrapData(response) ?? {});
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
