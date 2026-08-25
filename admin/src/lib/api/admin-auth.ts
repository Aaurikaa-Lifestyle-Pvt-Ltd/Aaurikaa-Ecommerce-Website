import { apiRequest, unwrapData } from "./client";
import {
  setAdminSession,
  clearAdminSession,
  type AdminSessionUser,
} from "./token-store";

type LoginResponse = {
  data?: {
    token?: string;
    admin?: {
      id?: string;
      _id?: string;
      email?: string;
      name?: string;
      username?: string;
      isSuperAdmin?: boolean;
      permissions?: string[];
    };
  };
};

type MeResponse = {
  data?: {
    id?: string;
    _id?: string;
    email?: string;
    name?: string;
    username?: string;
    isSuperAdmin?: boolean;
    permissions?: string[];
  };
};

export function normalizeAdminUser(raw: {
  id?: string;
  _id?: string;
  email?: string;
  name?: string;
  username?: string;
  isSuperAdmin?: boolean;
  permissions?: string[];
}): AdminSessionUser {
  return {
    id: String(raw.id ?? raw._id ?? ""),
    email: String(raw.email ?? ""),
    name: String(raw.name ?? raw.username ?? "Admin"),
    username: raw.username,
    isSuperAdmin: raw.isSuperAdmin,
    permissions: raw.permissions,
  };
}

export async function loginAdmin(
  emailOrUsername: string,
  password: string,
): Promise<AdminSessionUser> {
  const response = await apiRequest<LoginResponse>("/api/admin/login", {
    method: "POST",
    auth: false,
    body: { emailOrUsername: emailOrUsername.trim(), password },
  });
  const data = unwrapData(response);
  if (!data?.token || !data.admin) {
    throw new Error("Login succeeded without a session token.");
  }
  const user = normalizeAdminUser(data.admin);
  setAdminSession(data.token, user);
  return user;
}

export async function fetchAdminMe(): Promise<AdminSessionUser> {
  const response = await apiRequest<MeResponse>("/api/admin/me", { auth: true });
  return normalizeAdminUser(unwrapData(response) ?? {});
}

export type AdminProfileUpdateInput = {
  name?: string;
  email?: string;
  username?: string;
  phone?: string;
};

/** PUT /api/admin/update — self-service profile fields. */
export async function updateAdminProfile(
  input: AdminProfileUpdateInput,
): Promise<AdminSessionUser> {
  const response = await apiRequest<MeResponse>("/api/admin/update", {
    method: "PUT",
    body: input,
  });
  const raw = unwrapData(response) ?? {};
  const user = normalizeAdminUser(raw);
  return user;
}

/** PUT /api/admin/change-password — self-service password change. */
export async function changeAdminPassword(input: {
  oldPassword: string;
  newPassword: string;
}): Promise<void> {
  await apiRequest("/api/admin/change-password", {
    method: "PUT",
    body: {
      oldPassword: input.oldPassword,
      newPassword: input.newPassword,
    },
  });
}

export function logoutAdmin(): void {
  clearAdminSession();
}
