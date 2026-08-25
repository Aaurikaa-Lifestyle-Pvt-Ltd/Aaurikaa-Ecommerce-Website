const SHOPPER_TOKEN_KEY = "aaurikaa.shopper.token";
const SHOPPER_USER_KEY = "aaurikaa.shopper.user";

export interface ShopperSessionUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone?: string;
  profileImage?: string;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getShopperToken(): string | null {
  if (!canUseStorage()) return null;
  try {
    return localStorage.getItem(SHOPPER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getShopperUser(): ShopperSessionUser | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(SHOPPER_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ShopperSessionUser;
  } catch {
    return null;
  }
}

export function setShopperSession(token: string, user: ShopperSessionUser): void {
  if (!canUseStorage()) return;
  localStorage.setItem(SHOPPER_TOKEN_KEY, token);
  localStorage.setItem(SHOPPER_USER_KEY, JSON.stringify(user));
}

export function clearShopperSession(): void {
  if (!canUseStorage()) return;
  localStorage.removeItem(SHOPPER_TOKEN_KEY);
  localStorage.removeItem(SHOPPER_USER_KEY);
}

export const SHOPPER_STORAGE_KEYS = {
  token: SHOPPER_TOKEN_KEY,
  user: SHOPPER_USER_KEY,
} as const;
