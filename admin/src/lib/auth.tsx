"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ApiError } from "@/lib/api/errors";
import { isApiConfigured } from "@/lib/api/config";
import { onUnauthorized } from "@/lib/api/client";
import { fetchAdminMe, loginAdmin, logoutAdmin } from "@/lib/api/admin-auth";
import {
  clearAdminSession,
  getAdminToken,
  getStoredAdminUser,
  setAdminSession,
  type AdminSessionUser,
} from "@/lib/api/token-store";

interface AuthUser {
  email: string;
  name: string;
  id?: string;
  isSuperAdmin?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  ready: boolean;
  configured: boolean;
  login: (
    email: string,
    password: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(user: AdminSessionUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const configured = isApiConfigured();

  useEffect(() => {
    const id = window.setTimeout(() => {
      const stored = getStoredAdminUser();
      const token = getAdminToken();
      if (stored && token) setUser(toAuthUser(stored));
      setReady(true);

      if (!token || !configured) return;

      fetchAdminMe()
        .then((profile) => {
          setAdminSession(token, profile);
          setUser(toAuthUser(profile));
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.isUnauthorized) {
            clearAdminSession();
            setUser(null);
          }
        });
    }, 0);
    return () => window.clearTimeout(id);
  }, [configured]);

  useEffect(() => {
    return onUnauthorized(() => setUser(null));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const next = await loginAdmin(email, password);
      setUser(toAuthUser(next));
      return { ok: true as const };
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Unable to sign in. Please try again.";
      return { ok: false as const, error: message };
    }
  }, []);

  const logout = useCallback(() => {
    logoutAdmin();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, configured, login, logout }),
    [user, ready, configured, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
