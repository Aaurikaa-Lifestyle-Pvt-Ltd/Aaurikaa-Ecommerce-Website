const ADMIN_TOKEN_KEY = "aaurikaa.admin.token";
const ADMIN_USER_KEY = "aaurikaa.admin.user";

export interface AdminSessionUser {
  id: string;
  email: string;
  name: string;
  username?: string;
  isSuperAdmin?: boolean;
  permissions?: string[];
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getAdminToken(): string | null {
  if (!canUseStorage()) return null;
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredAdminUser(): AdminSessionUser | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(ADMIN_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AdminSessionUser;
  } catch {
    return null;
  }
}

export function setAdminSession(token: string, user: AdminSessionUser): void {
  if (!canUseStorage()) return;
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
}

export function clearAdminSession(): void {
  if (!canUseStorage()) return;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
}

export const ADMIN_STORAGE_KEYS = {
  token: ADMIN_TOKEN_KEY,
  user: ADMIN_USER_KEY,
} as const;
